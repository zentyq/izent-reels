const fs = require('fs');
const path = require('path');

const connectorsPath = path.join(__dirname, 'src', 'routes', 'connectors.tsx');
const platformsPath = path.join(__dirname, 'src', 'lib', 'platforms.tsx');

let connectorsCode = fs.readFileSync(connectorsPath, 'utf8');
const startIndex = connectorsCode.indexOf('const PLATFORMS = [');
const endIndex = connectorsCode.indexOf('] as const;') + '] as const;'.length;

const platformsCode = connectorsCode.slice(startIndex, endIndex);

const sharedFileContent = 'export ' + platformsCode + '\n';
fs.writeFileSync(platformsPath, sharedFileContent);

connectorsCode = connectorsCode.replace(platformsCode, '');
connectorsCode = connectorsCode.replace('import { CheckCircle2, RefreshCw, Loader2, Sparkles } from "lucide-react";', 'import { CheckCircle2, RefreshCw, Loader2, Sparkles } from "lucide-react";\nimport { PLATFORMS } from "@/lib/platforms";');

fs.writeFileSync(connectorsPath, connectorsCode);
