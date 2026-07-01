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

3) El "token del conector".
   Es una contraseña larga que se pone en DOS sitios y debe ser IDÉNTICA:
     - en Control M (variable AGORA_CONNECTOR_TOKEN, lo pone el admin), y
     - en este conector (config.json, campo "conector_token").
   Si no coincide, Control M rechaza los datos (es la seguridad).


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


DEJARLO CORRIENDO SOLO (Windows)
--------------------------------
Para que arranque al encender el PC y no haya que tocar nada:

  Opción sencilla (Programador de tareas):
   1) Abre "Programador de tareas" (Task Scheduler).
   2) Crear tarea básica → Nombre: "Conector Agora Control M".
   3) Desencadenador: "Al iniciar el equipo".
   4) Acción: "Iniciar un programa".
        Programa/script:  node
        Argumentos:       conector.js
        Iniciar en:       C:\control-m\conector-agora
   5) En las propiedades de la tarea marca "Ejecutar tanto si el usuario
      inició sesión como si no" y "Reiniciar la tarea si falla".
   Listo: se sincroniza cada 15 minutos (se cambia en config.json).


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
========================================================================
