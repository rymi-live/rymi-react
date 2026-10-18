import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import path from 'path';

// ES + CJS for npm. Everything a consumer's app already provides stays external.
export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'cjs' ? 'index.cjs' : 'index.mjs'),
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        '@rymi/web',
        '@livekit/components-react',
        /^livekit-client(\/.*)?$/,
      ],
    },
    sourcemap: true,
    emptyOutDir: true,
  },
  plugins: [dts({
    insertTypesEntry: true,
    entryRoot: path.resolve(__dirname, 'src'),
    exclude: ['**/*.test.ts', '**/*.test.tsx'],
  })],
});
