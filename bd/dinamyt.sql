-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Servidor: 127.0.0.1
-- Tiempo de generación: 27-01-2026 a las 22:25:54
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
  `pais` varchar(255) DEFAULT NULL,
  `ciudad` varchar(255) DEFAULT NULL,
  `alcance` varchar(255) DEFAULT NULL,
  `num_tatamis` int(11) DEFAULT NULL,
  `max_participantes` int(11) DEFAULT NULL,
  `es_publico` tinyint(1) DEFAULT NULL,
  `creado_por` bigint(20) DEFAULT NULL,
  `modalidades` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`modalidades`)),
  `fecha_inicio` date DEFAULT NULL,
  `fecha_fin` date DEFAULT NULL,
  `fecha_creacion` datetime NOT NULL DEFAULT current_timestamp(),
  `estado` varchar(255) DEFAULT NULL,
  `participantes` int(11) DEFAULT 0,
  `puede_inscribirse` tinyint(1) DEFAULT 1,
  `codigo` varchar(255) DEFAULT NULL,
  `nombre_creador` varchar(255) DEFAULT NULL,
  `visible` tinyint(1) DEFAULT NULL,
  `secciones` longtext DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `campeonato`
--

INSERT INTO `campeonato` (`id_campeonato`, `nombre`, `ubicacion`, `pais`, `ciudad`, `alcance`, `num_tatamis`, `max_participantes`, `es_publico`, `creado_por`, `modalidades`, `fecha_inicio`, `fecha_fin`, `fecha_creacion`, `estado`, `participantes`, `puede_inscribirse`, `codigo`, `nombre_creador`, `visible`, `secciones`) VALUES
(33, 'prueba 1', 'dsa', NULL, NULL, 'Regional', 11, 431, 0, 123456, '[{\"id\":\"combates\",\"nombre\":\"Combates\",\"activa\":true,\"categorias\":{\"cinturon\":[{\"activa\":true,\"tipo\":\"individual\",\"valor\":\"Blanco\"}],\"edad\":[{\"activa\":true,\"tipo\":\"individual\",\"valor\":\"21\"}],\"genero\":\"individual\"}}]', '2026-01-27', '2026-01-29', '2026-01-27 16:11:50', 'BORRADOR', 0, 1, '787054', 'Andres Gonzalez', 0, '[{\"PESO\":\"SIN_PESO\",\"EDAD\":\"21\",\"CINTURON\":\"Blanco\",\"GENERO\":\"Hombre\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-HOMBRE-BLANCO-21-SIN_PESO\"},{\"PESO\":\"SIN_PESO\",\"EDAD\":\"21\",\"CINTURON\":\"Blanco\",\"GENERO\":\"Mujer\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-MUJER-BLANCO-21-SIN_PESO\"}]'),
(35, 'campeonato 1', 'calle 12 #43-81-1', 'Colombia', 'Abejorral', 'Regional', 12, 200, 1, 123456, '[{\"id\":\"combates\",\"nombre\":\"Combates\",\"activa\":true,\"categorias\":{\"cinturon\":[{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"Blanco\",\"hasta\":\"Amarillo\"}],\"genero\":\"mixto\"}},{\"id\":\"figura-armas\",\"nombre\":\"Figura con armas\",\"activa\":true,\"categorias\":{\"cinturon\":[{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"Blanco\",\"hasta\":\"Amarillo\"}],\"genero\":\"mixto\"}}]', '2026-01-29', '2026-01-31', '2026-01-27 16:11:50', 'BORRADOR', 0, 1, NULL, 'Andres Gonzalez', 0, '[{\"PESO\":\"SIN_PESO\",\"CINTURON\":\"Blanco-Amarillo\",\"GENERO\":\"Mixto\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-MIXTO-BLANCO-AMARILLO-NULL-SIN_PESO\"},{\"PESO\":\"SIN_PESO\",\"CINTURON\":\"Blanco-Amarillo\",\"GENERO\":\"Mixto\",\"MODALIDAD\":\"Figura con armas\",\"RAIZ\":\"Campeonato\",\"ID\":\"FIGURA_CON_ARMAS-MIXTO-BLANCO-AMARILLO-NULL-SIN_PESO\"}]'),
(36, 'prueba de edicion', 'calle 12 #43-81-1', 'Afghanistan', 'Andkhoy', 'Regional', 1, 2, 1, 123456, '[{\"id\":\"figura-armas\",\"nombre\":\"Figura con armas\",\"activa\":true,\"categorias\":{\"cinturon\":[{\"activa\":true,\"tipo\":\"individual\",\"valor\":\"Blanco\"},{\"activa\":true,\"tipo\":\"individual\",\"valor\":\"Amarillo\"},{\"activa\":true,\"tipo\":\"individual\",\"valor\":\"Naranja\"}],\"genero\":\"mixto\"}}]', '2026-01-29', '2026-01-31', '2026-01-27 16:11:50', 'BORRADOR', 0, 1, NULL, 'Andres Gonzalez', 1, '[{\"PESO\":\"SIN_PESO\",\"CINTURON\":\"Blanco\",\"GENERO\":\"Mixto\",\"MODALIDAD\":\"Figura con armas\",\"RAIZ\":\"Campeonato\",\"ID\":\"FIGURA_CON_ARMAS-MIXTO-BLANCO-NULL-SIN_PESO\"},{\"PESO\":\"SIN_PESO\",\"CINTURON\":\"Amarillo\",\"GENERO\":\"Mixto\",\"MODALIDAD\":\"Figura con armas\",\"RAIZ\":\"Campeonato\",\"ID\":\"FIGURA_CON_ARMAS-MIXTO-AMARILLO-NULL-SIN_PESO\"},{\"PESO\":\"SIN_PESO\",\"CINTURON\":\"Naranja\",\"GENERO\":\"Mixto\",\"MODALIDAD\":\"Figura con armas\",\"RAIZ\":\"Campeonato\",\"ID\":\"FIGURA_CON_ARMAS-MIXTO-NARANJA-NULL-SIN_PESO\"}]'),
(37, 'prueba de creacion con la fecha de creacion', '213', 'Colombia', 'Abrego', 'Nacional', 12, 32, 1, 123456, '[{\"id\":\"combates\",\"nombre\":\"Combates\",\"activa\":true,\"categorias\":{\"cinturon\":[{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"Blanco\",\"hasta\":\"Negro\"}],\"genero\":\"mixto\"}}]', '2026-02-07', '2026-02-23', '2026-01-27 16:13:43', 'BORRADOR', 0, 1, NULL, 'Andres Gonzalez', 1, '[{\"PESO\":\"SIN_PESO\",\"CINTURON\":\"Blanco-Negro\",\"GENERO\":\"Mixto\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-MIXTO-BLANCO-NEGRO-NULL-SIN_PESO\"}]');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `estado`
--

CREATE TABLE `estado` (
  `idvisible` tinyint(11) NOT NULL,
  `descripcion` varchar(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `estado`
--

INSERT INTO `estado` (`idvisible`, `descripcion`) VALUES
(0, 'eliminado'),
(1, 'visible'),
(2, 'Pendiente'),
(3, 'Aceptado'),
(4, 'Rechazado');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `inscripciones`
--

CREATE TABLE `inscripciones` (
  `idinscripcion` bigint(11) NOT NULL,
  `idusuario` bigint(11) NOT NULL,
  `idcampeonato` bigint(11) NOT NULL,
  `secciones` longtext NOT NULL,
  `estado` tinyint(4) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
(4, 'dueño'),
(5, 'Competidor'),
(6, 'Juez Central'),
(7, 'Juez de mesa'),
(8, 'Juez');

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
  `ciudad` varchar(100) DEFAULT NULL,
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

INSERT INTO `usuario` (`ID_documento`, `nombreC`, `sexo`, `fecha_nacimiento`, `cinturon_rango`, `Nacionalidad`, `ciudad`, `Correo`, `Contraseña`, `numero_celular`, `Instructor`, `academia`, `tipo_usuario`) VALUES
(0, 'Independiente', 'masculino', '2026-01-01', 'Negro', 'colombia', NULL, 'nada@gmail.com', '1', '2', NULL, 0, 2),
(1, 'Instructor 1', 'masculino', '2026-01-01', 'Blanco', 'colombia', '', 'a@gmail.com', '1', '+571', 4, 1, 2),
(2, 'instructor 2', 'Masculino', '2019-04-04', 'Negro', 'colombia', 'Cúcuta', 'e@gmail.com', '1', '2', NULL, 2, 2),
(4, 'Instructor 2', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, 2),
(43013, 'AMIR SARMIENTO', 'Masculino', '2020-04-02', 'Blanco', 'Colombia', NULL, 'amirsarmiento0430@gmail.com', '1', '+570430', 0, 0, 3),
(123456, 'Andres Gonzalez', 'Masculino', '2019-04-04', 'Negro', 'Colombia', 'Cúcuta', 'andresivan0807@gmail.com', '1', '+573243100882', 0, 0, 3),
(7868776876, 'AMIR SARMIENTOQ', 'Masculino', '2019-04-03', 'Blanco', 'Albania', NULL, 'amirdaniel0430@gmail.com', '1', '+13', 1, 1, 4);

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
  ADD KEY `creado_por` (`creado_por`) USING BTREE,
  ADD KEY `visible` (`visible`) USING BTREE;

--
-- Indices de la tabla `estado`
--
ALTER TABLE `estado`
  ADD PRIMARY KEY (`idvisible`) USING BTREE;

--
-- Indices de la tabla `inscripciones`
--
ALTER TABLE `inscripciones`
  ADD PRIMARY KEY (`idinscripcion`),
  ADD UNIQUE KEY `idusuario` (`idusuario`,`idcampeonato`),
  ADD UNIQUE KEY `estado` (`estado`),
  ADD KEY `idcampeonato` (`idcampeonato`);

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
  MODIFY `id_campeonato` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=38;

--
-- AUTO_INCREMENT de la tabla `inscripciones`
--
ALTER TABLE `inscripciones`
  MODIFY `idinscripcion` bigint(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `tipo_usuario`
--
ALTER TABLE `tipo_usuario`
  MODIFY `ID_Tipo` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `campeonato`
--
ALTER TABLE `campeonato`
  ADD CONSTRAINT `campeonato_ibfk_1` FOREIGN KEY (`creado_por`) REFERENCES `usuario` (`ID_documento`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `campeonato_ibfk_2` FOREIGN KEY (`visible`) REFERENCES `estado` (`idvisible`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Filtros para la tabla `inscripciones`
--
ALTER TABLE `inscripciones`
  ADD CONSTRAINT `inscripciones_ibfk_1` FOREIGN KEY (`estado`) REFERENCES `estado` (`idvisible`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `inscripciones_ibfk_2` FOREIGN KEY (`idusuario`) REFERENCES `usuario` (`ID_documento`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `inscripciones_ibfk_3` FOREIGN KEY (`idcampeonato`) REFERENCES `campeonato` (`id_campeonato`) ON DELETE CASCADE ON UPDATE CASCADE;

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
