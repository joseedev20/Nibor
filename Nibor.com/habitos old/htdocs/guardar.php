<?php
echo "ingreso";
// $host = "localhost";
// $usuario = "tu_usuario_mysql";
// $password = "tu_contraseña_mysql";
// $bd = "nombre_base_datos";

// $conn = new mysqli($host, $usuario, $password, $bd);

// if ($conn->connect_error) {
//   die("Conexión fallida: " . $conn->connect_error);
// }


$respuesta = $_POST['respuesta'];
echo "Swipe registrado: " . $respuesta;
// $sql = "INSERT INTO respuestas (opcion) VALUES ('$respuesta')";

// if ($conn->query($sql) === TRUE) {
//   echo "¡Respuesta guardada!";
// } else {
//   echo "Error: " . $conn->error;
// }

// $conn->close();
?>


