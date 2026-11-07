import ts from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import sonar from 'eslint-plugin-sonarjs';
export default ts.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  ...ts.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': hooks, sonar },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      complexity: ['error', 10],
      'sonar/cognitive-complexity': ['error', 15],
      'max-depth': ['error', 3],
      'max-len': ['error', { code: 120, ignoreUrls: true, ignoreStrings: true, ignoreTemplateLiterals: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  { files: ['tests/**', 'e2e/**'], rules: { complexity: 'off', 'sonar/cognitive-complexity': 'off' } },
);
