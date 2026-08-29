/* ============================================================================
   0021 — funkcje wewnętrzne przestają być wywoływalne z internetu.

   CO ZGŁOSIŁ LINTER SUPABASE (29.08.2026)
     Trzy funkcje `SECURITY DEFINER` są wystawione jako endpointy REST i może je wywołać
     rola `anon`, czyli każdy, kto zna adres projektu:

       /rest/v1/rpc/assign_race_number
       /rest/v1/rpc/chat_touch_thread
       /rest/v1/rpc/rls_auto_enable

     `SECURITY DEFINER` znaczy „wykonaj z prawami właściciela", czyli z pominięciem RLS.
     Wystawienie takiej funkcji publicznie to wystawienie uprawnień właściciela bazy.

   CO KAŻDA Z NICH ROBI I CZEMU TO PROBLEM
     assign_race_number()  trigger BEFORE INSERT na registrations. Nadaje numer startowy.
     chat_touch_thread()   trigger na chat_messages. Podnosi licznik nieprzeczytanych.

       Obie są funkcjami wyzwalacza i wołane po HTTP odmówią, bo nie mają kontekstu
       triggera. Nie są więc groźne dzisiaj — ale są wystawione bez powodu, a to, że
       przypadkiem nie da się ich wykorzystać, jest cechą ich implementacji, nie
       zabezpieczeniem. Zmiana ciała funkcji może to cicho odwrócić.

     rls_auto_enable()     to jest ta, która ma znaczenie. Włącza RLS na tabelach —
       funkcja administracyjna, wołana raz przy zakładaniu bazy. Wystawiona publicznie
       daje obcemu możliwość uruchomienia operacji DDL na cudzym schemacie.

   CZEGO TA MIGRACJA NIE ROBI
     Nie zmienia `SECURITY DEFINER` na `SECURITY INVOKER`. Triggery muszą działać
     z prawami właściciela, bo wstawia je funkcja przez PostgREST, a nie właściciel bazy.
     Zmiana trybu zepsułaby zapisywanie zgłoszeń.

     Odbieramy więc samo prawo wywołania po HTTP, zostawiając wywołanie z triggera —
     trigger nie sprawdza EXECUTE dla roli wołającej, bo wykonuje go silnik.

   CZEGO CELOWO NIE RUSZAM, MIMO ŻE LINTER KRZYCZY
     `public_counts` i `wall_rating` są `SECURITY DEFINER` z rozmysłem: to jedyne dwie
     rzeczy, które publiczna strona może przeczytać, i mają pokazywać sumy oraz inicjały
     bez dawania dostępu do tabel pod spodem. Linter zgłasza to jako ERROR, bo nie wie,
     że o to właśnie chodzi. Patrz komentarz przy widoku w 0013.

     „RLS enabled, no policy" na jedenastu tabelach też jest zamierzone: brak polityki
     przy włączonym RLS znaczy „nikt nic nie może", a funkcja na Vercelu i tak używa
     klucza `service_role`, który RLS omija. To jest domyślna odmowa, nie dziura.

   MOŻNA PUŚCIĆ PONOWNIE — `revoke` na już odebranym prawie nie jest błędem.
   ========================================================================== */

revoke execute on function public.assign_race_number() from public, anon, authenticated;
revoke execute on function public.chat_touch_thread() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

/* Asercja zamiast wiary. `has_function_privilege` odpowiada na dokładnie to pytanie,
   które zadał linter, więc jeśli ktoś w przyszłości nada te prawa z powrotem — czy to
   ręcznie, czy przez `grant all on all functions` — wdrożenie się zatrzyma tutaj,
   a nie w raporcie bezpieczeństwa za trzy miesiące. */
do $$
declare
  leftover text;
begin
  select string_agg(name, ', ')
    into leftover
    from (
      select f.name
        from (values
                ('public.assign_race_number()'),
                ('public.chat_touch_thread()'),
                ('public.rls_auto_enable()')
             ) as f(name)
       where has_function_privilege('anon', f.name, 'EXECUTE')
          or has_function_privilege('authenticated', f.name, 'EXECUTE')
    ) still_public;

  if leftover is not null then
    raise exception 'te funkcje nadal sa wywolywalne po HTTP: %', leftover;
  end if;
end;
$$;
