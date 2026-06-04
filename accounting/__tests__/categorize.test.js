const { test } = require('node:test');
const assert = require('node:assert');
const { pickCategory } = require('../router');

test('pickCategory devuelve solo una categoría válida del set permitido', () => {
  const allowed = ['comida', 'casa1', 'parking'];
  assert.strictEqual(pickCategory('comida', allowed), 'comida');
  assert.strictEqual(pickCategory('  Comida.', allowed), 'comida'); // normaliza
  assert.strictEqual(pickCategory('inventada', allowed), null);      // fuera del set → null
});
