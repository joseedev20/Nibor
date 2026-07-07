<?php
// protected_example.php — ejemplo de página protegida
declare(strict_types=1);
session_start();
if (!isset($_SESSION['user_id'])) {
  header('Location: /login_form.html');
  exit;
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Panel</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body{font-family: system-ui, Arial, sans-serif; padding: 2rem; max-width: 720px; margin: auto;}
    a.button{display:inline-block;padding:.6rem 1rem;border:1px solid #ccc;border-radius:8px;text-decoration:none}
  </style>
</head>
<body>
  <h1>¡Hola, <?php echo htmlspecialchars($_SESSION['user_name']); ?>!</h1>
  <p>Has iniciado sesión como <strong><?php echo htmlspecialchars($_SESSION['user_email']); ?></strong>.</p>
  <p><a class="button" href="/logout.php">Cerrar sesión</a></p>
</body>
</html>
