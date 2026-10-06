========================================================================
 CONECTOR ÁGORA  →  CONTROL M
 m de materia · nota para quien lo instala
========================================================================

QUÉ HACE (en una frase)
-----------------------
Un programita que corre en el PC del local, lee las ventas de Ágora y
las manda solas a Control M (la web de producción). Así el stock se
descuenta automáticamente con cada venta, sin que nadie copie nada.

No abre puertos, no necesita IP fija: solo sale a internet por HTTPS,
igual que un navegador. El PC de Ágora tiene que estar encendido.


LO QUE NECESITAS ANTES DE EMPEZAR (3 cosas)
-------------------------------------------
1) El "Api-Token" de Ágora.
   En Ágora: Configuración → Integraciones / API. Copia el token y
   comprueba que la API está activada (suele escuchar en el puerto 8984).

2) La dirección web de Control M.
   Es la URL con la que entráis a la web (algo como
   https://control-m.onrender.com).

3) La "clave del conector".
   Se genera DENTRO de la app, sin tocar nada del servidor:
     Centro de control -> Conector TPV (Ágora) -> "Generar clave".
   Copia esa clave (empieza por "mdm_"; solo se ve completa una vez) y
   pégala en este conector (config.json, campo "conector_token"). En esa
   misma pantalla tienes la URL y un botón para probar la conexión.
   Si la clave no coincide, Control M rechaza los datos (es la seguridad).

   NOTA: antes se usaba una variable de entorno (AGORA_CONNECTOR_TOKEN) en
   el servidor. Ya no hace falta: la clave se gestiona desde la app. Si esa
   variable existe, también se sigue aceptando.

COMPROBAR QUE TODO ESTÁ BIEN (antes de dejarlo corriendo)
---------------------------------------------------------
   Ejecuta:   node conector.js --probar
   Debe decir "Control M: conexión y clave correctas" y, si hay Api-Token,
   "Ágora: lectura del export correcta". Si algo falla, lo marca con una X.


INSTALACIÓN (una sola vez)
--------------------------
1) Instala Node.js en el PC (si no está): https://nodejs.org  → "LTS".

2) Copia esta carpeta "conector-agora" al PC, por ejemplo en
   C:\control-m\conector-agora

3) Dentro de la carpeta, copia el archivo "config.ejemplo.json" y
   renómbralo a "config.json". Ábrelo con el Bloc de notas y rellena:
     - agora_token   → el Api-Token de Ágora
     - controlm_base → la URL de Control M
     - conector_token→ el token del conector (el mismo que en Control M)
   Guarda.

4) Prueba: abre una consola en la carpeta y escribe:
        node conector.js
   Deberías ver líneas como:
        Sync: 3 procesado(s) · 0 bloqueado(s) · 0 ya estaban · 3 confirmado(s) a Ágora
   Si ves un error, el propio mensaje te dice qué falta (token, URL, etc.).


DEJARLO CORRIENDO SOLO, PARA SIEMPRE (Windows) · 1 CLIC
-------------------------------------------------------
Con config.json relleno y Node.js instalado:

  >> Clic DERECHO en  "instalar-autoarranque.bat"
     -> "Ejecutar como administrador"   (una sola vez)

Eso crea una TAREA DEL SISTEMA que deja el conector:
   · arrancando al ENCENDER el PC (aunque nadie inicie sesión),
   · reiniciándose solo si se cae (y cada 10 min comprueba que vive),
   · corriendo oculto en segundo plano (no hay ventana que cerrar).

Es exactamente lo que evita que se vuelva a desconectar al apagar/encender
el TPV. No hay que volver a tocar nada.

  Para PARARLO algún día: abre "Programador de tareas" de Windows, busca
  "Conector Agora Control M" y deshabilítala.


CÓMO SÉ QUE FUNCIONA
--------------------
- En Control M, sección Ventas / Ágora: verás "Conector configurado",
  la última sincronización y los tickets procesados.
- Si aparece algún ticket BLOQUEADO, es porque un producto de Ágora
  todavía no está vinculado a un escandallo en Control M. El sistema NO
  descuenta stock de ese ticket hasta que lo vinculéis (así no se
  descuenta mal). Vincula el producto y en la siguiente vuelta entra solo.


SEGURIDAD (importante)
----------------------
- El "agora_token" y el "conector_token" van SOLO en config.json, en el
  PC del local. Nunca se ponen en la web ni se envían a nadie.
- No subas config.json a internet ni lo mandes por email/chat.
- Si crees que un token se ha filtrado: el admin lo cambia en Control M y
  tú lo cambias en config.json (deben seguir siendo iguales).


DUDAS FRECUENTES
----------------
· "¿Tengo que entrar en Ágora cada día?"  No. Una vez configurado, va solo.
· "¿Y si se apaga el PC?"  Mientras esté apagado no sincroniza; al
  encenderlo recupera lo pendiente (Ágora guarda lo no confirmado).
· "¿Descuenta dos veces si se reinicia?"  No. Cada ticket lleva un
  identificador único; Control M ignora los que ya procesó.

LOS ARCHIVOS DE ESTA CARPETA
----------------------------
  · instalar-autoarranque.bat → clic DERECHO -> "Ejecutar como admin" UNA
                              vez. Deja el conector corriendo solo para
                              siempre (arranca al encender, se reinicia si
                              se cae, en segundo plano). ES EL RECOMENDADO.
  · instalar-servicio.ps1   → lo usa el .bat de arriba. No se toca a mano.
  · arrancar.bat            → doble clic para arrancarlo A MANO ahora y ver
                              la ventana (útil para probar). Si se cae, se
                              reintenta solo cada 15 s. Deja log en
                              conector.log.
  · conector.js             → el programa. No se edita.
  · config.json             → tus tokens y URL (lo creas tú del ejemplo).
  · conector.log            → registro automático (para diagnosticar).

SI SE TE HABÍA DESCONECTADO / ACTUALIZAR A ESTA VERSIÓN
-------------------------------------------------------
1) Copia esta carpeta "conector-agora" ENCIMA de la del PC, reemplazando
   los archivos  (CONSERVA tu config.json: no lo sobrescribas).
2) Clic derecho en "instalar-autoarranque.bat" -> "Ejecutar como admin".
Con eso queda la versión blindada + el arranque como servicio. Ya no se
vuelve a parar al apagar/encender el TPV.

CÓMO COMPROBAR QUE ESTÁ VIVO
----------------------------
- En Control M -> Informes -> "Ventas . Agora": última sincronización.
- O abre  conector.log  en la carpeta: verás una línea "Sync: ..." por
  cada vuelta.
========================================================================
