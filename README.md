# Philips — base de escritorio

Base inicial de Electron + React + Vite + TypeScript. QVAC y las funciones del producto están pendientes de implementación. La estructura de dominio propuesta conserva sus `.gitkeep`.

## Uso

Requiere Node.js 22.17 o superior compatible con las dependencias instaladas.

```sh
npm install
npm run dev
```

- `npm run dev`: inicia Vite y abre Electron; React se actualiza con HMR. Reinicia el comando después de editar el proceso principal o preload.
- `npm run dev:web`: inicia únicamente la interfaz en el navegador.
- `npm run build`: verifica tipos y compila interfaz y Electron.
- `npm start`: abre Electron con el build local; requiere `npm run build` previamente.
- `npm run smoke`: comprueba el build en una ventana Electron oculta y cierra automáticamente.

La compilación todavía no genera un instalador. La interfaz no tiene acceso directo a Node; se reservó un preload aislado para futuros contratos IPC. No se instaló Fastify, QVAC, persistencia ni sincronización P2P.
