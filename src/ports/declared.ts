// Clés considérées comme « un port » : PORT, SERVER_PORT, DB_PORT, VITE_PORT…
const PORT_KEY = /^(?:[A-Za-z0-9]+_)*PORT$/i;

/**
 * Extrait les numéros de port déclarés dans un fichier .env (clés PORT et *_PORT).
 * Seules ces valeurs, qui sont des numéros de port (donc non secrets), sont conservées ;
 * toute autre valeur du fichier est ignorée sans être stockée.
 */
export function extractDeclaredPorts(envContent: string): number[] {
  const ports = new Set<number>();
  for (const rawLine of envContent.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match || !PORT_KEY.test(match[1])) continue;
    // Retire guillemets et commentaire en fin de ligne : PORT="3000" # api
    const value = match[2].replace(/\s+#.*$/, '').replace(/^["']|["']$/g, '').trim();
    if (!/^\d{1,5}$/.test(value)) continue;
    const port = Number(value);
    if (port >= 1 && port <= 65535) ports.add(port);
  }
  return [...ports];
}
