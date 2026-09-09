import { downloadAll, inspectModels, modelsDir } from './model-pack.ts';

const status = inspectModels();
if (status.ready) {
  console.log('Ya están los modelos en', modelsDir());
  for (const item of status.items) console.log(' ', item.label, item.file);
  process.exit(0);
}

console.log('Descargando', status.items.filter(item => !item.ready).length, 'modelo(s) →', modelsDir());
try {
  await downloadAll({ onProgress: message => console.log(message) });
  console.log('Listo. En Capturar, Procesar ya puede usar QVAC.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
