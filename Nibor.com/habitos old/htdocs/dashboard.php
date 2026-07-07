<?php
session_start();
if (!isset($_SESSION['user_id'])) {
  header('Location: index.html'); exit;
}
$usuario_nombre = $_SESSION['user_name'] ?? 'Usuario';
?>

<!DOCTYPE html>
<html lang="es" class="dark">


<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mis Hábitos</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        primary: '#7c3aed',
                        softbg: '#f9f9fb',
                        cardpink: '#fbcfe8',
                        violeta: '#b7b2e7'
                    },
                    fontFamily: {
                        sans: ['Poppins', 'sans-serif'],
                    }
                }
            }
        }
    </script>

    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">

    <style>
        html,
        body {
            overscroll-behavior: none;
            touch-action: pan-y;
            overflow-x: hidden;
        }
            .no-scrollbar::-webkit-scrollbar {
      display: none;
    }
    /* 2) Oculta scrollbar en Firefox, IE y Edge */
    .no-scrollbar {
      -ms-overflow-style: none;  /* IE 10+ */
      scrollbar-width: none;     /* Firefox */
    }
    </style>





</head>

<body class="bg-softbg dark:bg-gray-900 text-gray-800 dark:text-gray-100 overflow-x-hidden overflow-y-hidden ">

    <!-- Header -->
    <!-- Header -->



    <header class="flex justify-between items-center p-6 shadow-sm bg-white dark:bg-gray-800">
        <h1 class="text-xl font-semibold text-primary flex items-center gap-2">

            <button onclick="toggleSidebar()" class="text-xl font-semibold text-primary flex items-center gap-2"> 🌿
                HabitDay ☰</button>
        </h1>
        <span class="text-sm text-gray-600 dark:text-gray-300">
            Hola, <strong class="font-semibold">
                <?php echo htmlspecialchars($usuario_nombre); ?>
            </strong>
        </span>
        <button id="toggle-theme" onclick="cambiarTema()" title="Cambiar tema" class="text-2xl">
            🌙
        </button>

    </header>




    <aside id="sidebar"
        class="fixed top-0 left-0 h-full w-64 bg-white shadow-lg p-6 transform -translate-x-full md:translate-x-0 transition-transform duration-300 z-40  dark:bg-gray-800">
        <h2 class="text-lg font-semibold text-primary mb-6">🌱 HabitDay</h2>
        <nav class="flex flex-col space-y-4">
            <a href="#" onclick="mostrarSeccion('seccion-principal')" class="text-primary hover:underline">Marcar Hábitos</a>
            <a href="#" onclick="mostrarSeccion('seccion-habitos')" class="text-primary hover:underline">Mis Hábitos</a>
            <a href="#" onclick="mostrarSeccion('seccion-proceso')" class="text-primary hover:underline">Proceso</a>
            <a href="logout.php" class="text-sm text-gray-500 hover:underline">Cerrar sesión</a>
        </nav>
    </aside>

    <main class="md:ml-64 px-9 py-9 overflow-x-hidden">

        <!-- Sección principal: hábitos de hoy -->
        <section id="seccion-principal">
            <h2 class="text-2xl font-semibold mb-7 text-center">Tus hábitos de hoy</h2>
            <h3 class="text-sm text-gray-500 italic text-center mb-6">
            <p id="frase-inspiradora" class="italic text-gray-500"> </p>
                
           
            </h3>

            <div id="mensaje-completado"
                class="hidden mt-6 text-center text-green-600 text-xl font-semibold flex items-center justify-center gap-2">
                ✅ ¡Has completado todos tus hábitos diarios!
            </div>

            <div id="contenedor" class="relative h-[500px]">

            </div>
        </section>




        <!-- Sección: Ver Proceso -->
        <section id="seccion-proceso" class="hidden px-4 py-6 dark:bg-gray-800 max-h-[calc(100vh-120px)] overflow-y-auto no-scrollbar">
            <h2 class="text-3xl font-bold text-center text-primary mb-2">📈 Tu progreso</h2>
            <p class="text-center text-sm text-gray-500 dark:text-gray-400 mb-6">Mira cómo vas con tus hábitos</p>

            <div id="resumen-progreso" class="max-w-3xl mx-auto mb-6"></div>
            <div id="lista-progreso" class="max-w-3xl mx-auto space-y-4"></div>
        </section>



        <!-- justo después de <section id="seccion-habitos">…</section> -->
        <section id="seccion-habitos" class="hidden px-6 py-3">
            <h2 class="text-3xl font-bold text-center text-primary mb-6">Mis Hábitos</h2>
            <h3 class="text-sm text-gray-500 italic text-center mb-6">
                “A veces, el paso más pequeño en la dirección correcta termina siendo el paso más grande de tu vida”.
                —Mary Square
            </h3>
            <h4 class="text-center text-gray-600 mb-4">Arrastra y suelta para cambiar el orden</h4>
             <div class="max-h-64 overflow-y-auto mx-auto max-w-md space-y-3">
            <ul id="lista-organizable" class="space-y-4 max-w-md mx-auto">
            </ul>
            </div>
            <br>


            <!-- Crear Hábito + volver -->
            <div class="flex flex-col items-center gap-4">
                <button onclick="abrirModal()"
                    class="bg-primary text-white px-6 py-3 rounded-lg shadow-md hover:bg-purple-700 transition">
                    Crear Hábito
                </button>
                <button onclick="mostrarSeccion('seccion-principal')" class="text-sm text-primary hover:underline">←
                    Volver al inicio</button>
            </div>
  <div
    class="absolute bottom-0 left-1/2 transform -translate-x-1/2 opacity-50 w-full max-w-md
           pointer-events-none select-none z-0"
    style="
      background-image: url('assets/img/habit-illustration-men.png');
      background-repeat: no-repeat;
      background-size: contain;
      background-position: center;
      height: 200px;
    ">
  </div>
</section>
        </section>


    </main>




    <!-- Sección: Crear Hábito -->
    <section id="seccion-crear" class="hidden">
        <!-- Formulario para crear hábito -->
    </section>

    <!-- Sección: Ver Proceso -->
    <section id="seccion-proceso" class="hidden">
        <!-- Información de progreso -->
    </section>

    </main>




    <div id="modal-habito" class="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50 hidden">
        <div
            class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-[90%] max-w-sm p-6 border border-gray-200 dark:border-gray-700">
            <h2 class="text-2xl font-bold text-primary mb-4 text-center">🌱 Nuevo Hábito</h2>

            <label class="block mb-2 font-semibold text-sm text-gray-700 dark:text-gray-300">Nombre</label>
            <input type="text" id="nombre-habito"
                class="w-full border border-gray-300 dark:border-gray-600 px-4 py-2 rounded-md mb-4 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white"
                placeholder="Ej. Meditar" />

            <label class="block mb-2 font-semibold text-sm text-gray-700 dark:text-gray-300">Frecuencia por día</label>
            <input type="number" min="1" max="10" value="1" id="frecuencia-habito"
                class="w-full border border-gray-300 dark:border-gray-600 px-4 py-2 rounded-md mb-4 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white"
                placeholder="Ej. 2" />

            <label class="block mb-2 font-semibold text-sm text-gray-700 dark:text-gray-300">Días de la semana</label>
            <div class="flex gap-2 mb-6" id="dias-container">
                <div data-dia="L" class="dia rounded-full w-9 h-9 border flex items-center justify-center
                 cursor-pointer select-none transition">
                    L</div>
                <div data-dia="M"
                    class="dia rounded-full w-9 h-9 border flex items-center justify-center cursor-pointer select-none transition">
                    M</div>
                <div data-dia="X"
                    class="dia rounded-full w-9 h-9 border flex items-center justify-center cursor-pointer select-none transition">
                    X</div>
                <div data-dia="J"
                    class="dia rounded-full w-9 h-9 border flex items-center justify-center cursor-pointer select-none transition">
                    J</div>
                <div data-dia="V"
                    class="dia rounded-full w-9 h-9 border flex items-center justify-center cursor-pointer select-none transition">
                    V</div>
                <div data-dia="S"
                    class="dia rounded-full w-9 h-9 border flex items-center justify-center cursor-pointer select-none transition">
                    S</div>
                <div data-dia="D"
                    class="dia rounded-full w-9 h-9 border flex items-center justify-center cursor-pointer select-none transition">
                    D</div>
            </div>

            <div class="flex justify-between mt-4">
                <button onclick="cerrarModal()"
                    class="text-gray-500 dark:text-gray-300 hover:underline">Cancelar</button>
                <button
                       onclick="guardarNuevoHabito()" class="bg-primary text-white px-5 py-2 rounded-md hover:bg-purple-700 transition">Guardar</button>
            </div>


        </div>
    </div>



    <div id="modal-editar" class="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50 hidden">
        <div
            class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-[90%] max-w-sm p-6 border border-gray-200 dark:border-gray-700">
            <h2 class="text-2xl font-bold text-primary mb-4 text-center">✏️ Editar Hábito</h2>

            <!-- Nombre -->
            <label class="block mb-2 font-semibold text-sm text-gray-700 dark:text-gray-300">Nombre</label>
            <input id="input-habito" type="text"
                class="w-full border border-gray-300 dark:border-gray-600 px-4 py-2 rounded-md mb-4 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white" />

            <!-- Frecuencia por día -->
            <label class="block mb-2 font-semibold text-sm text-gray-700 dark:text-gray-300">Frecuencia por día</label>
            <input id="input-frecuencia" type="number" min="1" max="10"
                class="w-full border border-gray-300 dark:border-gray-600 px-4 py-2 rounded-md mb-4 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white" />

            <!-- Días de la semana -->
            <label class="block mb-2 font-semibold text-sm text-gray-700 dark:text-gray-300">Días de la semana</label>
            <div class="flex gap-2 mb-6" id="dias-container-editar">
                <div data-dia="L"
                    class="dia rounded-full w-9 h-9 border flex items-center justify-center cursor-pointer select-none transition">
                    L</div>
                <div data-dia="M"
                    class="dia rounded-full w-9 h-9 border flex items-center justify-center cursor-pointer select-none transition">
                    M</div>
                <div data-dia="X"
                    class="dia rounded-full w-9 h-9 border flex items-center justify-center cursor-pointer select-none transition">
                    X</div>
                <div data-dia="J"
                    class="dia rounded-full w-9 h-9 border flex items-center justify-center cursor-pointer select-none transition">
                    J</div>
                <div data-dia="V"
                    class="dia rounded-full w-9 h-9 border flex items-center justify-center cursor-pointer select-none transition">
                    V</div>
                <div data-dia="S"
                    class="dia rounded-full w-9 h-9 border flex items-center justify-center cursor-pointer select-none transition">
                    S</div>
                <div data-dia="D"
                    class="dia rounded-full w-9 h-9 border flex items-center justify-center cursor-pointer select-none transition">
                    D</div>
            </div>

            <!-- Botones -->
            <div class="flex justify-between mt-4">
                <button onclick="cerrarModalEditar()"
                    class="text-gray-500 dark:text-gray-300 hover:underline">Cancelar</button>
                <div class="flex gap-4">
                    <button onclick="guardarEdicionHabito()"
                        class="bg-primary text-white px-5 py-2 rounded-md hover:bg-purple-700 transition">Guardar</button>
                    <button onclick="eliminarHabitoDesdeModal()"
                        class="text-red-600 dark:text-red-400 hover:underline">Eliminar</button>
                </div>
            </div>
        </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"></script>

<script src="js/script.js"></script>
<script src="js/dashboard.js"></script>


    <!-- 🎉 Confetti JS -->



</body>
<script>
  // Bloquear menú contextual (clic derecho / long-press en algunos navegadores)
  document.addEventListener('contextmenu', e => e.preventDefault(), {passive:false});

  // Bloquear inicio de selección
  document.addEventListener('selectstart', e => e.preventDefault(), {passive:false});

  // Bloquear arrastre (drag & drop de texto/imagenes)
  document.addEventListener('dragstart', e => e.preventDefault(), {passive:false});

  // Bloquear copiar / cortar / pegar del browser
  ['copy','cut','paste'].forEach(evt =>
    document.addEventListener(evt, e => e.preventDefault(), {passive:false})
  );

  // Bloquear atajos comunes (Ctrl/Cmd + C/X/V/U/P/S/A, etc.)
  document.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && ['c','x','v','u','p','s','a'].includes(k)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
</script>


</html>