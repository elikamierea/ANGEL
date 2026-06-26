// Portable Windows packaging for a small-range release.
// Produces dist/ANGEL-win32-x64/ (run ANGEL.exe). No installer, no asar —
// app files stay plain on disk so the runtime file reads (prompts/, about/,
// new_project_template/, shared/) are guaranteed to work.
const path = require('path');
const { packager } = require('@electron/packager');

const ROOT = __dirname;

(async () => {
  const appPaths = await packager({
    dir: ROOT,
    name: 'ANGEL',
    platform: 'win32',
    arch: 'x64',
    icon: path.join(ROOT, 'favicon.ico'),
    out: path.join(ROOT, 'dist'),
    overwrite: true,
    // Keep only the single runtime dependency (elkjs); drop everything else from
    // node_modules and exclude dev/source/doc cruft so the portable bundle stays lean.
    prune: false,
    ignore: [
      /^\/dist($|\/)/,
      /^\/build-pack\.cjs$/,
      /^\/\.git($|\/)/,
      /^\/\.openclaw($|\/)/,
      /^\/src($|\/)/,
      /^\/docs($|\/)/,
      /^\/node_modules\/(?!elkjs($|\/))/,
      /\.test\.js$/,
      /\.rar$/,
      /^\/tsconfig\.json$/,
      /^\/README\.md$/,
      /desktop\.ini$/,
      // Bundled CMake (tools/cmake) rides along for the build chain; trim the parts the
      // app never invokes so the portable bundle stays lean (keeps bin/cmake.exe + Modules).
      /^\/tools\/cmake\/doc($|\/)/,
      /^\/tools\/cmake\/man($|\/)/,
      /^\/tools\/cmake\/bin\/cmake-gui\.exe$/,
      /^\/tools\/cmake\/bin\/ccmake\.exe$/,
    ],
  });
  console.log('Packaged at:', appPaths.join(', '));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
