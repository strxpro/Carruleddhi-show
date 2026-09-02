const fs = require('fs');
let s = fs.readFileSync('src/admin/views/Chat.tsx', 'utf8');

s = s.replace(
  /import \{ Loader2/,
  "import { Highlighter } from './Highlighter';\nimport { Loader2"
);

s = s.replace(
  /export function Chat\(\{/,
  "export function Chat({\n  highlightQuery,"
);

s = s.replace(
  /onChanged: \(\) => void;/,
  "onChanged: () => void;\n  highlightQuery?: string;"
);

s = s.replace(
  />\{thread\.name\}<\/span>/g,
  "><Highlighter text={thread.name} query={highlightQuery} /></span>"
);

fs.writeFileSync('src/admin/views/Chat.tsx', s, 'utf8');
console.log('Chat.tsx patched successfully.');
