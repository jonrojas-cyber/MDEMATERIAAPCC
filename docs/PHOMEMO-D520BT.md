# Impresión de etiquetas · Phomemo D520BT

Control M genera etiquetas térmicas de **62 × 40 mm** con QR para cada lote.
Esta guía explica cómo dejar la Phomemo D520BT lista para imprimirlas desde el
navegador como una impresora más del sistema.

## Qué imprime

Cada etiqueta lleva, a la izquierda, el nombre de la preparación, el código de
lote, la fecha de producción, la fecha de consumo recomendada, la cantidad y el
responsable; y a la derecha, un **QR** que abre la ficha del lote. El tamaño es
exacto: **62 mm de ancho × 40 mm de alto**.

Desde la pantalla **Lotes activos**, el botón **Imprimir etiqueta** abre la
etiqueta y lanza el diálogo de impresión. Cada impresión queda registrada en el
**historial** (`/api/etiquetas/historial`).

## 1. Emparejar la impresora en Windows (Bluetooth)

1. Enciende la Phomemo D520BT y comprueba que el LED de Bluetooth parpadea.
2. En Windows: **Configuración → Bluetooth y dispositivos → Agregar dispositivo
   → Bluetooth**.
3. Selecciona **D520BT** en la lista y completa el emparejamiento.

## 2. Instalar el driver y configurarla como impresora del sistema

1. Descarga el driver oficial desde la web de Phomemo (modelo **D520**) e
   instálalo.
2. Abre **Configuración → Bluetooth y dispositivos → Impresoras y escáneres**.
   La D520BT debe aparecer como impresora.
3. Ábrela → **Preferencias de impresión** y define el tamaño de papel:
   - **Ancho: 62 mm · Alto: 40 mm** (crea un tamaño personalizado si no existe).
   - Márgenes a **0**.
   - Orientación **horizontal** (apaisado).
4. *(Opcional)* Márcala como **impresora predeterminada** mientras trabajáis con
   etiquetas, para que el navegador la seleccione sola.

## 3. Ajustes de impresión en el navegador (Chrome / Edge)

Al pulsar **Imprimir etiqueta** se abre el diálogo de impresión. La primera vez:

1. **Destino**: selecciona **Phomemo D520BT**.
2. **Más opciones / Configuración**:
   - **Tamaño de papel**: 62 × 40 mm.
   - **Márgenes**: Ninguno.
   - **Escala**: 100 % (no "Ajustar al área de impresión").
   - **Gráficos de fondo**: activado (para que el QR salga nítido).
3. Imprime. El navegador recordará estos ajustes para las siguientes.

> La etiqueta ya trae `@page { size: 62mm 40mm; margin: 0 }`, así que con
> márgenes "Ninguno" y escala 100 % encaja al milímetro.

## 4. Probar sin imprimir

Abre directamente en el navegador (sustituye el id de lote):

```
http://TU-SERVIDOR/etiqueta/lote/lote-001
```

Verás la etiqueta en pantalla con un botón **Imprimir**. Añade `?print=1` para
que lance el diálogo automáticamente:

```
http://TU-SERVIDOR/etiqueta/lote/lote-001?print=1
```

## Solución de problemas

- **Sale cortada o muy pequeña**: revisa que el tamaño de papel sea 62 × 40 mm y
  la escala 100 % (no "ajustar").
- **El QR sale en blanco**: activa **Gráficos de fondo** en el diálogo de
  impresión.
- **No aparece la impresora**: vuelve a emparejar por Bluetooth y confirma que
  el driver D520 está instalado.
- **Texto desplazado**: pon todos los márgenes a 0 en las preferencias de la
  impresora y en el diálogo del navegador.
