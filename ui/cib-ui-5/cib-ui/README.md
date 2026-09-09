# cib-ui

Frontend para el reto de Customer Installed Base Intelligence.

**La UI no tiene datos propios.** Todo viene del backend. Sin backend corriendo, cada pantalla muestra "El servidor no responde" con un botón de reintentar.

## Arrancar

```bash
npm install
npm run dev
```

Abre en `http://localhost:5173`. El script usa `--host`, así que también se abre desde el celular con la IP de la laptop.

## Conectar el backend

Vite ya proxea `/api` hacia `http://localhost:3000`. Si el backend corre ahí, no hay que configurar nada.

Si corre en otro puerto:

```bash
VITE_API_URL=http://localhost:4000/api npm run dev
```

## Contrato de API

Los ejemplos completos de lo que cada ruta debe devolver están en **`docs/contrato-api.json`**. Pasale ese archivo a quien haga el backend.

| Método | Ruta | Devuelve |
|---|---|---|
| GET | `/api/clientes` | lista con `confianza` y `pendientes` (número) |
| GET | `/api/clientes/:id` | ficha con `equipos[]` y `pendientes[]` |
| GET | `/api/geo` | jerarquía Región → País → Ciudad → Hospital |
| GET | `/api/resumen` | métricas y `oportunidades[]` |
| POST | `/api/observaciones` | `{texto}` → `{items[], conflictos[]}` |
| POST | `/api/observaciones/:id/confirmar` | `{respuestas}` → ok |

## Convenciones que el backend debe respetar

**Estados en inglés**, como vienen en el Excel: `Confirmed`, `Reported`, `Estimated`, `Unknown`. La UI los traduce al mostrarlos (ver `components/Estado.jsx`).

**Modalidades**, las seis del Excel: `MR`, `CT`, `Ultrasound`, `X-Ray`, `Patient Monitoring`, `Image Guided Therapy`. Normalizar sinónimos: MRI → MR, scanner → CT.

**Marcas ficticias del Excel**: NovaMed, Aurelia Health, BluePeak Medical, Orion Imaging, HelixCare, Zenith MedTech. No inventar otras, los casos de prueba usan estas.

**Confianza** es un número de 0 a 100 por cliente. No viene en el Excel, hay que derivarla. Sugerencia: completitud de campos × peso del estado × cobertura de modalidades. Sea cual sea la fórmula, hay que poder explicarla si el jurado pregunta.

**Campos nulos** son normales. Si no se sabe la marca, mandar `null`, nunca adivinar. El Excel lo dice explícito en la hoja de lógica conversacional.

## Estructura

```
src/
  api/client.js        ← todas las llamadas al backend
  components/
    Estado.jsx         ← EstadoBadge y Confianza
    Estados.jsx        ← carga, error y el hook usePedido
    Iconos.jsx         ← SVG inline, sin CDN
  screens/
    Clientes.jsx       ← lista, menos confianza primero
    Ficha.jsx          ← la pantalla que vende la idea
    Captura.jsx        ← texto libre y confirmación sí/no/no sé
    Mapa.jsx           ← navegación por niveles
    Resumen.jsx        ← agregados y oportunidades
  styles.css           ← todo el diseño sale de las variables de arriba
docs/contrato-api.json ← ejemplos para el backend
```

## Decisiones que vale la pena defender

**Los estados llevan icono además de color.** En un proyector los colores mienten y hay gente que no distingue verde de ámbar.

**La lista ordena por menos confianza primero.** La app le dice al ingeniero dónde falta información, no le muestra un catálogo.

**"No sé" es un botón del mismo tamaño que "Sí".** El Excel dice explícitamente: si no se sabe la marca, guardar como Unknown y nunca forzar una adivinanza.

**El mapa no usa Leaflet ni Mapbox.** Cualquier librería de mapas carga tiles desde internet, y el mapa se pondría gris justo cuando desconecten el wifi para demostrar que la inferencia es local. Se navega por niveles: bloques por país y ciudad, puntos por hospital.

**Sin librería de iconos, sin router, sin Tailwind.** Cero dependencias que puedan fallar sin conexión.

## Pendiente

**El dictado por voz no está conectado.** El botón del micrófono muestra un aviso. Hay que decidir: la API del navegador es gratis pero usa servidores de Google y rompe el argumento de inferencia local, o Whisper vía QVAC, que es otro modelo y otra descarga. Si no da el tiempo, quitar el botón antes de la demo. Es peor mostrar algo que finge funcionar.

**Consultas en lenguaje natural sobre el dataset.** El brief lo menciona con ejemplo propio ("clientes en Brasil con resonadores de más de siete años"). No hay pantalla todavía.
