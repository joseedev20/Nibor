<?php
// logout.php
declare(strict_types=1);

session_start();

// Vacía variables de sesión
$_SESSION = [];

// Borra la cookie de la sesión (por si se usa)
if (ini_get('session.use_cookies')) {
  $params = session_get_cookie_params();
  setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
}

// Destruye la sesión
session_destroy();

// Redirige al inicio (tu login)
header('Location: index.html');
exit;
