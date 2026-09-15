# CloudSuite Design System

## Reglas

1. Antes de crear cualquier componente, verificar si existe en LightAble. Si existe, reutilizarlo.
2. Usar las variables SCSS de esta guía. No hardcodear valores hexadecimales en componentes.
3. Los gráficos usan ApexCharts con la paleta CloudSuite: verde para SI, rojo para NO y amarillo para Indeciso.
4. Cards, Modals, Forms, Tables, Badges, Buttons y Navbar usan clases Bootstrap/LightAble, no componentes visuales custom.

## CloudSuite Brand Colors

```scss
// CloudSuite Brand Colors
$primary: #0060F0;           // Azul CloudSuite
$primary-hover: #0078F0;     // Variante más clara
$primary-active: #0048F0;    // Variante más oscura
$secondary: #D6008C;         // Magenta

// States
$success: #10B981;           // Verde (Conversión SI)
$danger: #EF4444;            // Rojo (Conversión NO)
$warning: #F59E0B;           // Amarillo (Indeciso)
$neutral: #6B7280;           // Gris (no visitado)

// Grays
$gray-900: #303030;          // Texto principal
$gray-600: #6B7280;          // Texto secundario
$gray-200: #E5E7EB;          // Border/divider
$light: #F9FAFB;             // Fondo light
$dark: #1F2937;              // Fondo dark

// Fonts
$font-family-base: 'Rubik', sans-serif;
$headings-font-family: 'Rubik', sans-serif;
$headings-font-weight: 700;
```

## Componentes

- Cards: `.card` y clases Bootstrap/LightAble.
- Modals: componente `Modal` de React Bootstrap/LightAble.
- Forms: `form-group`, `form-control` y `form-check`.
- Tables: `.table`, preferentemente `.table-striped` y `.table-hover`.
- Badges: `.badge` con variantes de la paleta de estados.
- Buttons: `.btn`, `.btn-primary`, `.btn-success`, `.btn-danger` y `.btn-warning`.
- Navbar y sidebar: controles e iconos del template LightAble.

## Escala global de z-index

```scss
$z-base: 1;
$z-sticky-header: 100;
$z-dropdown: 1000;
$z-modal-backdrop: 2000;
$z-modal: 2100;
$z-toast: 3000;
$z-tooltip: 3500;
```

Ningún elemento flotante (dropdown, modal, tooltip o toast) puede usar un `z-index` fuera de esta escala. Los componentes canónicos deben consumir estos tokens; los niveles bajos solo se reservan para capas decorativas dentro de su propio componente.

## Regla obligatoria de espaciado

Ningún componente puede renderizar dos o más elementos hermanos (bloques de texto o botones/acciones) sin envolverlos en `Stack` (vertical) o `Inline` (horizontal). Está prohibido usar `margin` o `gap` hardcodeado a mano para separar elementos hermanos dentro de una card. Si necesitás separar algo, usá estos componentes; si no alcanzan para el caso, avisá antes de improvisar un valor nuevo.
