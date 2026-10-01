import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

/**
 * Get the package version from package.json
 * @returns The version string from package.json
 * @throws Error if package.json cannot be read or parsed
 */
export function getPackageVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    let currentDir = dirname(__filename);

    // Search for package.json by going up directories
    // This works both in development (src/utils/) and after build (dist/)
    let packageJsonPath = '';
    let maxDepth = 5; // Prevent infinite loop

    while (maxDepth > 0) {
      const candidatePath = join(currentDir, 'package.json');
      if (existsSync(candidatePath)) {
        packageJsonPath = candidatePath;
        break;
      }
      const parentDir = dirname(currentDir);
      if (parentDir === currentDir) {
        // Reached filesystem root
        break;
      }
      currentDir = parentDir;
      maxDepth--;
    }

    if (!packageJsonPath) {
      throw new Error('Could not find package.json in parent directories');
    }

    const packageJson = readFileSync(packageJsonPath, 'utf-8');
    const parsed = JSON.parse(packageJson);

    if (!parsed.version) {
      throw new Error('Version field not found in package.json');
    }

    return parsed.version;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to read package version: ${error.message}`);
    }
    throw new Error('Failed to read package version: Unknown error');
  }
}
