# Impresión de etiquetas · Phomemo D520

Control M genera etiquetas térmicas de **90 × 40 mm** con QR para cada lote.
Esta guía explica cómo imprimirlas **por cable, directo y sin diálogo** (modo
recomendado para el TPV) y, como alternativa, por Bluetooth desde el móvil.

## Qué imprime

Cada etiqueta lleva, a la izquierda, un **QR** de trazabilidad (abre la ficha
del lote con la vida útil en vivo) y, a la derecha, el nombre de la preparación,
el código de lote, la fecha de elaboración, la fecha de consumo recomendada, la
cantidad y el responsable. El tamaño es exacto: **90 mm de ancho × 40 mm de
alto**, con `@page { size: 90mm 40mm; margin: 0 }`.

---

## A. Cable directo, sin preguntar (RECOMENDADO para el TPV)

El objetivo: pulsar **Imprimir** y que la etiqueta **salga sola** por la
impresora conectada por USB, sin que aparezca el diálogo de "¿imprimir?".

Control M ya genera la etiqueta a tamaño exacto y la manda a la impresora del
sistema; lo único que hace falta es abrir Control M en un **navegador en modo
`kiosk-printing`**, que imprime directo a la impresora predeterminada. Eso lo
deja montado la carpeta **`impresora-directa/`** del repositorio.

### Montaje (una sola vez, en el PC del TPV)

1. **Impresora por USB**: conéctala y enciéndela. Instala su **driver**
   (Phomemo D520). En *Configuración → Bluetooth y dispositivos → Impresoras y
   escáneres* debe aparecer.
2. **Preferencias de impresión** de la impresora:
   - **Tamaño de papel: 90 × 40 mm** (crea un tamaño personalizado si no existe).
   - **Márgenes: 0.**
   - **Orientación: horizontal** (apaisado).
   - *(Recomendado)* márcala como **impresora predeterminada**.
3. Copia la carpeta **`impresora-directa`** al PC (p. ej. `C:\control-m\`).
4. *(Opcional)* abre `Imprimir-directo.bat` con el Bloc de notas y revisa:
   - `CONTROLM_URL` → la URL de Control M (ya viene la de producción).
   - `IMPRESORA` → el nombre EXACTO de la impresora en Windows (p. ej.
     `Phomemo D520`); así la deja predeterminada al abrir. Vacío `""` = no la toca.
5. Doble clic en **`instalar-acceso-directo.bat`**: crea en el escritorio el
   acceso **“Control M · Imprimir etiquetas”**.

### Día a día

- Abre Control M **con ese acceso del escritorio** (no con el navegador normal;
  el normal sí pregunta).
- En **Etiquetas**: elige producto y operación, pulsa **Imprimir** → la etiqueta
  sale sola y la ventana de impresión se cierra ella.
- Verifícalo con **“Imprimir prueba”**: no debe aparecer ningún diálogo.

> Por qué funciona: el acceso abre el navegador con `--kiosk-printing` y
> `--app=<url>`. Ese modo imprime directo a la impresora predeterminada sin
> diálogo. La página de la etiqueta llama a `window.print()` y se autocierra al
> terminar (`afterprint`).

---

## B. Bluetooth desde el móvil (alternativa)

Para etiquetar con el teléfono/tablet sin cable: en la pantalla **Etiquetas**,
botón **“📶 Conectar Bluetooth”** (Chrome/Edge en Android; iPhone/Safari no tiene
Bluetooth web). La primera vez se elige la **D520** y luego reconecta sola. El
botón **“diagnóstico”** ayuda a afinar el canal/lenguaje si hiciera falta.

---

## C. Impresora del sistema con diálogo (respaldo)

Si abres Control M con el navegador normal, al imprimir aparece el diálogo del
navegador. La primera vez:

1. **Destino**: selecciona la **Phomemo D520**.
2. **Tamaño de papel**: 90 × 40 mm · **Márgenes**: Ninguno · **Escala**: 100 %
   (no "Ajustar al área de impresión") · **Gráficos de fondo**: activado (QR
   nítido). El navegador recuerda estos ajustes.

## Solución de problemas

- **Sale el diálogo de imprimir**: has abierto Control M con el navegador
  normal; usa el acceso **“Control M · Imprimir etiquetas”**.
- **Imprime en PDF o en otra impresora**: la de etiquetas no es la
  predeterminada; ponla por defecto o indícala en `IMPRESORA` del `.bat`.
- **Sale cortada o pequeña**: revisa 90 × 40 mm y escala 100 % (no "ajustar").
- **El QR sale en blanco**: activa **Gráficos de fondo** en el diálogo.
- **Texto desplazado**: márgenes a 0 en las preferencias de la impresora.
