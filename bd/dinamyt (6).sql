-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Servidor: 127.0.0.1
-- Tiempo de generación: 21-01-2026 a las 04:17:30
-- Versión del servidor: 10.4.32-MariaDB
-- Versión de PHP: 8.0.30

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `dinamyt`
--

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `academia`
--

CREATE TABLE `academia` (
  `ID_academia` int(11) NOT NULL,
  `nombre` varchar(255) DEFAULT NULL,
  `descripcion` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `academia`
--

INSERT INTO `academia` (`ID_academia`, `nombre`, `descripcion`) VALUES
(0, 'Sin academia', 'veni aqui hijo puta '),
(1, 'academia 1', 'mas academias por delante'),
(2, 'academia 2', 'pues academia 2\r\n');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `campeonato`
--

CREATE TABLE `campeonato` (
  `id_campeonato` bigint(20) NOT NULL,
  `nombre` varchar(255) DEFAULT NULL,
  `ubicacion` varchar(255) DEFAULT NULL,
  `alcance` varchar(255) DEFAULT NULL,
  `num_tatamis` int(11) DEFAULT NULL,
  `max_participantes` int(11) DEFAULT NULL,
  `es_publico` tinyint(1) DEFAULT NULL,
  `creado_por` bigint(20) DEFAULT NULL,
  `modalidades` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`modalidades`)),
  `fecha_inicio` date DEFAULT NULL,
  `fecha_fin` date DEFAULT NULL,
  `estado` varchar(255) DEFAULT NULL,
  `participantes` int(11) DEFAULT 0,
  `puede_inscribirse` tinyint(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `campeonato`
--

INSERT INTO `campeonato` (`id_campeonato`, `nombre`, `ubicacion`, `alcance`, `num_tatamis`, `max_participantes`, `es_publico`, `creado_por`, `modalidades`, `fecha_inicio`, `fecha_fin`, `estado`, `participantes`, `puede_inscribirse`) VALUES
(9, 'asd', 'asd', 'Regional', 12, 21, 1, 123456, '[{\"id\":\"combates\",\"nombre\":\"Combates\",\"activa\":true,\"categorias\":{\"cinturon\":[{\"nombre\":\"\",\"activa\":true,\"tipo\":\"individual\",\"valor\":\"Naranja/verde\"}],\"edad\":[],\"peso\":[],\"genero\":null}},{\"id\":\"figura-armas\",\"nombre\":\"Figura con armas\",\"activa\":false,\"categorias\":{\"cinturon\":[],\"edad\":[],\"peso\":[],\"genero\":null}},{\"id\":\"figura-manos\",\"nombre\":\"Figura a manos libres\",\"activa\":false,\"categorias\":{\"cinturon\":[],\"edad\":[],\"peso\":[],\"genero\":null}},{\"id\":\"defensa-personal\",\"nombre\":\"Defensa personal\",\"activa\":false,\"categorias\":{\"cinturon\":[],\"edad\":[],\"peso\":[],\"genero\":null}},{\"id\":\"salto-alto\",\"nombre\":\"Salto alto\",\"activa\":false,\"categorias\":{\"cinturon\":[],\"edad\":[],\"peso\":[],\"genero\":null}},{\"id\":\"salto-largo\",\"nombre\":\"Salto largo\",\"activa\":false,\"categorias\":{\"cinturon\":[],\"edad\":[],\"peso\":[],\"genero\":null}}]', NULL, NULL, 'BORRADOR', 0, 1);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `tipo_usuario`
--

CREATE TABLE `tipo_usuario` (
  `ID_Tipo` int(11) NOT NULL,
  `descripcion` varchar(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `tipo_usuario`
--

INSERT INTO `tipo_usuario` (`ID_Tipo`, `descripcion`) VALUES
(1, 'usuario'),
(2, 'instructor'),
(3, 'administrador'),
(4, 'dueño');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `usuario`
--

CREATE TABLE `usuario` (
  `ID_documento` bigint(20) NOT NULL,
  `nombreC` varchar(150) NOT NULL,
  `sexo` varchar(20) DEFAULT NULL,
  `fecha_nacimiento` date DEFAULT NULL,
  `cinturon_rango` varchar(20) DEFAULT NULL,
  `Nacionalidad` varchar(20) DEFAULT NULL,
  `Correo` varchar(120) DEFAULT NULL,
  `Contraseña` varchar(255) DEFAULT NULL,
  `numero_celular` varchar(30) DEFAULT NULL,
  `Instructor` bigint(20) DEFAULT NULL,
  `academia` int(11) DEFAULT NULL,
  `tipo_usuario` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `usuario`
--

INSERT INTO `usuario` (`ID_documento`, `nombreC`, `sexo`, `fecha_nacimiento`, `cinturon_rango`, `Nacionalidad`, `Correo`, `Contraseña`, `numero_celular`, `Instructor`, `academia`, `tipo_usuario`) VALUES
(0, 'Independiente', 'masculino', '2026-01-01', 'negro', 'colombia', 'nada', '1', '2', NULL, 0, 2),
(1, 'Instructor 1', 'masculino', '2026-01-01', 'negro', 'colombia', 'a', NULL, '1', NULL, 1, 2),
(2, 'instructor 2', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 2, 2),
(123456, 'Andres Gonzalez', 'Masculino', '2019-04-04', NULL, 'Colombia', 'andresivan0807@gmail.com', '1', NULL, 2, 2, 3);

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `academia`
--
ALTER TABLE `academia`
  ADD PRIMARY KEY (`ID_academia`);

--
-- Indices de la tabla `campeonato`
--
ALTER TABLE `campeonato`
  ADD PRIMARY KEY (`id_campeonato`),
  ADD KEY `creado_por` (`creado_por`) USING BTREE;

--
-- Indices de la tabla `tipo_usuario`
--
ALTER TABLE `tipo_usuario`
  ADD PRIMARY KEY (`ID_Tipo`);

--
-- Indices de la tabla `usuario`
--
ALTER TABLE `usuario`
  ADD PRIMARY KEY (`ID_documento`),
  ADD KEY `idx_instructor` (`Instructor`),
  ADD KEY `idx_academia` (`academia`),
  ADD KEY `fk_usuario_tipo` (`tipo_usuario`),
  ADD KEY `academia` (`academia`) USING BTREE;

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `campeonato`
--
ALTER TABLE `campeonato`
  MODIFY `id_campeonato` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `campeonato`
--
ALTER TABLE `campeonato`
  ADD CONSTRAINT `campeonato_ibfk_1` FOREIGN KEY (`creado_por`) REFERENCES `usuario` (`ID_documento`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Filtros para la tabla `usuario`
--
ALTER TABLE `usuario`
  ADD CONSTRAINT `fk_usuario_academia` FOREIGN KEY (`academia`) REFERENCES `academia` (`ID_academia`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_usuario_instructor` FOREIGN KEY (`Instructor`) REFERENCES `usuario` (`ID_documento`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_usuario_tipo` FOREIGN KEY (`tipo_usuario`) REFERENCES `tipo_usuario` (`ID_Tipo`) ON DELETE SET NULL ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
