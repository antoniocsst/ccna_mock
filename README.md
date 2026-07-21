# 🕹️ CCNA Mock Exam

Simulador de examen **CCNA 200-301** con estética pixel art. Python (Flask) se encarga de
seleccionar y barajar las preguntas, calificar, guardar el historial de puntajes y generar
el análisis de resultados; el navegador solo pinta el juego.

## Características

- **Banco de 100 preguntas esenciales** distribuidas según los pesos del blueprint oficial:
  Fundamentos de Red (20), Acceso a la Red (20), Conectividad IP (25), Servicios IP (10),
  Seguridad (15) y Automatización (10).
- **Exámenes que varían**: cada intento toma una muestra aleatoria (10 / 25 / 50 / 100
  preguntas) y además baraja el orden de las opciones.
- **Puntaje estilo Cisco**: escala 0–1000 con corte de aprobación en 825.
- **Temporizador** proporcional (90 s por pregunta) con envío automático al agotarse.
- **Análisis al finalizar**: desglose por dominio y revisión pregunta por pregunta con la
  respuesta correcta y su explicación (filtrable por correctas/falladas).
- **Registro de puntajes** persistente en `scores.json` con tabla de high scores.
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

> ⚠️ **Sobre los puntajes:** en el plan gratuito el disco es efímero, así que
> `scores.json` se reinicia cada vez que el servicio se duerme o se redespliega.
> Es normal para empezar. Para conservar el historial de forma permanente hay que
> mover los puntajes a una base de datos (paso siguiente del proyecto); la ruta del
> archivo ya es configurable con la variable de entorno `SCORES_FILE`.

> ℹ️ El plan Free "duerme" el servicio tras ~15 min sin uso; la primera visita
> después puede tardar ~30 s en despertar. Es esperable.

## Estructura

```
app.py              # servidor Flask: sesiones de examen, calificación, historial
questions.py        # banco de 100 preguntas (dominio, opciones, correcta, explicación)
templates/index.html
static/style.css    # tema pixel art
static/game.js      # navegación del examen y render de resultados
scores.json         # historial de intentos (se crea automáticamente)
render.yaml         # blueprint de despliegue en Render
Procfile            # comando de arranque en producción (gunicorn)
```
