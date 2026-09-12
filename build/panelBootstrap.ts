import type { Plugin } from 'vite';

// Keep the single-file release, but let the browser paint the shell before
// downloading and parsing the inlined application bundle.
export function movePanelAssetsAfterShell(html: string): string {
  const scripts: string[] = [];
  const styles: string[] = [];
  const shell = html.replace(
    /<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi,
    (tag) => {
      const opening = tag.slice(0, tag.indexOf('>') + 1);
      if (/^<script\b/i.test(opening) && /\btype=["']module["']/i.test(opening)) {
        scripts.push(tag);
        return '';
      }
      if (/^<style\b/i.test(opening) && !opening.includes('id="management-bootstrap-style"')) {
        styles.push(tag);
        return '';
      }
      return tag;
    }
  );
  const bodyEnd = shell.lastIndexOf('</body>');
  if (bodyEnd < 0) throw new Error('Management panel build is missing its body');
  const ready = '<script>document.getElementById("management-bootstrap")?.dispatchEvent(new Event("management-assets-ready"));</script>';
  return `${shell.slice(0, bodyEnd)}${styles.join('\n')}\n${scripts.join('\n')}\n${ready}\n${shell.slice(bodyEnd)}`;
}

export function panelBootstrap(): Plugin {
  return {
    name: 'management-panel-bootstrap',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'asset' && file.fileName.endsWith('.html')) {
          file.source = movePanelAssetsAfterShell(String(file.source));
        }
      }
    },
  };
}
