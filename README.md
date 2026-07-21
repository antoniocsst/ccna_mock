# 🕹️ CCNA Mock Exam

Simulador de examen **CCNA 200-301** con estética pixel art. Python (Flask) se encarga de
seleccionar y barajar las preguntas, calificar, guardar el historial de puntajes y generar
el análisis de resultados; el navegador solo pinta el juego.

## Características

- **Banco de 100 preguntas esenciales** distribuidas según los pesos del blueprint oficial:
  Fundamentos de Red (20), Acceso a la Red (20), Conectividad IP (25), Servicios IP (10),
  Seguridad (15) y Automatización (10).
- **Dos modos**: examen **general** (mezcla los 6 dominios) o **por tópico** (practica
  un solo dominio); la cantidad de preguntas se ajusta a lo disponible en cada caso.
- **Exámenes que varían**: cada intento toma una muestra aleatoria (10 / 25 / 50 / 100
  preguntas) y además baraja el orden de las opciones.
- **Puntaje estilo Cisco**: escala 0–1000 con corte de aprobación en 825.
- **Temporizador** proporcional (90 s por pregunta) con envío automático al agotarse.
- **Análisis al finalizar**: desglose por dominio y revisión pregunta por pregunta con la
  respuesta correcta y su explicación (filtrable por correctas/falladas).
- **Registro de puntajes** persistente con tabla de high scores y estadísticas globales
  en la portada (intentos, jugadores y aprobados reales).
- **Diseño pixel art**: CRT scanlines, confetti pixelado al aprobar, animaciones amigables
  y atajos de teclado (A–D para responder, ← → para navegar).

## Cómo ejecutarlo

```bash
pip install -r requirements.txt
python app.py
```

Luego abre <http://127.0.0.1:5000> en tu navegador y pulsa **PRESS START**.

## Publicarlo gratis en Render

El proyecto ya trae `render.yaml` y `Procfile`, así que subirlo a
[Render](https://render.com) es directo:

1. Sube este repositorio a tu cuenta de GitHub (ya está en la rama del proyecto).
2. En Render: **New → Blueprint**, conecta tu repo y selecciona la rama. Render lee
   `render.yaml` y crea el servicio web automáticamente (plan **Free**).
3. Espera al primer deploy. Quedará online en una URL tipo
   `https://ccna-mock-exam.onrender.com` que puedes compartir.

Alternativa manual (**New → Web Service**) si no usas el Blueprint:
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `gunicorn app:app --workers 1 --timeout 60`

> ℹ️ El plan Free "duerme" el servicio tras ~15 min sin uso; la primera visita
> después puede tardar ~30 s en despertar. Es esperable.

## Puntajes permanentes con Postgres (gratis)

En el plan Free de Render el disco es efímero, así que `scores.json` se borra al
dormir o redesplegar. Para que el historial sea **permanente** la app puede usar
una base de datos PostgreSQL gratuita (por ejemplo [Neon](https://neon.tech)):

1. Crea una cuenta gratis en Neon y un proyecto (base de datos). No hace falta
   crear tablas: la app crea la tabla `scores` sola al arrancar.
2. Copia la **connection string** que te da Neon
   (`postgresql://usuario:clave@host/db?sslmode=require`).
3. En Render, dentro de tu servicio → **Environment** → añade una variable:
   - **Key:** `DATABASE_URL`
   - **Value:** la connection string de Neon
4. Guarda. Render redespliega y a partir de ahí los puntajes se guardan en Postgres.

**Cómo decide la app:** si existe `DATABASE_URL` usa PostgreSQL; si no, cae al
archivo `scores.json` local. Así, en tu computadora sigue funcionando sin instalar
ni configurar nada.

## Estructura

```
app.py              # servidor Flask: sesiones de examen, calificación, historial
questions.py        # banco de 100 preguntas (dominio, opciones, correcta, explicación)
templates/index.html
static/style.css    # tema pixel art
static/game.js      # navegación del examen y render de resultados
store.py            # almacenamiento de puntajes: PostgreSQL o JSON según entorno
scores.json         # historial local (se crea solo cuando no hay base de datos)
render.yaml         # blueprint de despliegue en Render
Procfile            # comando de arranque en producción (gunicorn)
```
