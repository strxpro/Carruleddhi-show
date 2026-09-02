const fs = require('fs');
let s = fs.readFileSync('src/admin/App.tsx', 'utf8');

// 1. Add imports
s = s.replace(
  /import \{ fetchInbox, type Inbox \} from '\.\/api';/,
  "import { fetchInbox, type Inbox, fetchRoster, fetchSponsorLeads, fetchThreads } from './api';"
);

// 2. Add highlightQuery state and modify go()
s = s.replace(
  /const \[paletteOpen, setPaletteOpen\] = useState\(false\);/,
  "const [paletteOpen, setPaletteOpen] = useState(false);\n  const [highlightQuery, setHighlightQuery] = useState('');"
);

s = s.replace(
  /const go = useCallback\(\n    \(id: string\) => \{/,
  "const go = useCallback(\n    (id: string) => {\n      if (id.startsWith('searchResult:')) {\n        const [, tabId, query] = id.split(':');\n        setHighlightQuery(query || '');\n        setTab(tabId as TabId);\n        return;\n      }\n      setHighlightQuery('');"
);

// 3. Add search logic
s = s.replace(
  /const flat = useMemo\(\(\) => flattenNav\(groups, bottom\), \[groups, bottom\]\);/,
  `const flat = useMemo(() => flattenNav(groups, bottom), [groups, bottom]);

  const [searchResults, setSearchResults] = useState<NavItemData[]>([]);
  const handleGlobalSearch = useCallback(async (query: string) => {
    if (!query || query.trim().length < 2 || !key) {
      setSearchResults([]);
      return;
    }
    const needle = query.trim().toLowerCase();
    try {
      const [roster, sponsors, threads] = await Promise.all([
        fetchRoster(key, 500).catch(() => ({ roster: [] })),
        fetchSponsorLeads(key, 100).catch(() => ({ leads: [] })),
        fetchThreads(key, 100).catch(() => ({ threads: [] }))
      ]);
      const results: NavItemData[] = [];
      
      roster.roster?.forEach(p => {
        if (p.name.toLowerCase().includes(needle) || p.email?.toLowerCase().includes(needle)) {
          results.push({
            id: \`searchResult:registrations:\${needle}\`,
            title: p.name || '?',
            subtitle: t('nav.registrations') + (p.email ? \` • \${p.email}\` : ''),
            icon: ListChecks
          });
        }
      });

      sponsors.leads?.forEach(l => {
        if (l.name.toLowerCase().includes(needle) || l.contact_person?.toLowerCase().includes(needle)) {
          results.push({
            id: \`searchResult:settings:\${needle}\`,
            title: l.name || '?',
            subtitle: 'Sponsor' + (l.contact_person ? \` • \${l.contact_person}\` : ''),
            icon: Settings
          });
        }
      });

      threads.threads?.forEach(tItem => {
        if (tItem.name?.toLowerCase().includes(needle) || tItem.email?.toLowerCase().includes(needle)) {
          results.push({
            id: \`searchResult:chat:\${needle}\`,
            title: tItem.name || '?',
            subtitle: t('nav.chat') + (tItem.email ? \` • \${tItem.email}\` : ''),
            icon: MessageSquare
          });
        }
      });

      setSearchResults(results);
    } catch (e) {}
  }, [key, t]);`
);

// 4. Pass props to CommandPalette
s = s.replace(
  /<CommandPalette\n\s+items=\{flat\}\n\s+open=\{paletteOpen\}\n\s+onClose=\{\(\) => setPaletteOpen\(false\)\}\n\s+onSelect=\{go\}\n\s+placeholder=\{t\('nav\.searchPlaceholder'\)\}\n\s+emptyLabel=\{t\('nav\.searchEmpty'\)\}\n\s+\/>/,
  `<CommandPalette
        items={flat}
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelect={go}
        placeholder={t('nav.searchPlaceholder')}
        emptyLabel={t('nav.searchEmpty')}
        externalResults={searchResults}
        onSearchChange={handleGlobalSearch}
      />`
);

// 5. Pass highlightQuery down to views
s = s.replace(
  /<Registrations t=\{t\} locale=\{locale\} apiKey=\{key\} onChanged=\{refreshInbox\} \/>/,
  "<Registrations t={t} locale={locale} apiKey={key} onChanged={refreshInbox} highlightQuery={highlightQuery} />"
);
s = s.replace(
  /<SettingsView/,
  "<SettingsView highlightQuery={highlightQuery}"
);
s = s.replace(
  /<Chat t=\{t\} locale=\{locale\} apiKey=\{key\} onChanged=\{refreshInbox\} \/>/,
  "<Chat t={t} locale={locale} apiKey={key} onChanged={refreshInbox} highlightQuery={highlightQuery} />"
);

fs.writeFileSync('src/admin/App.tsx', s, 'utf8');
console.log('App.tsx patched successfully.');
