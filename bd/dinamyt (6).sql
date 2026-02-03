-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Servidor: 127.0.0.1
-- Tiempo de generación: 04-02-2026 a las 00:30:52
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
  `descripcion` varchar(255) DEFAULT NULL,
  `ciudad` varchar(255) DEFAULT NULL,
  `direccion` varchar(255) DEFAULT NULL,
  `link_red_social` varchar(255) DEFAULT NULL,
  `numero_contacto` varchar(255) DEFAULT NULL,
  `pais` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `academia`
--

INSERT INTO `academia` (`ID_academia`, `nombre`, `descripcion`, `ciudad`, `direccion`, `link_red_social`, `numero_contacto`, `pais`) VALUES
(0, 'Sin academia', 'veni aqui hijo puta ', NULL, NULL, NULL, NULL, NULL),
(1, 'academia 1', 'mas academias por delante', NULL, NULL, NULL, NULL, NULL),
(2, 'academia 2', 'pues academia 2\r\n', NULL, NULL, NULL, NULL, NULL);

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
  `secciones` longtext DEFAULT NULL,
  `secciones_activas` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `campeonato`
--

INSERT INTO `campeonato` (`id_campeonato`, `nombre`, `ubicacion`, `pais`, `ciudad`, `alcance`, `num_tatamis`, `max_participantes`, `es_publico`, `creado_por`, `modalidades`, `fecha_inicio`, `fecha_fin`, `fecha_creacion`, `estado`, `participantes`, `puede_inscribirse`, `codigo`, `nombre_creador`, `visible`, `secciones`, `secciones_activas`) VALUES
(39, 'Prueba de inscripcion 2', 'calle 12 #43-81-1', 'Algeria', 'Algiers', 'Nacional', 12, 234, 1, 123456, '[{\"id\":\"combates\",\"nombre\":\"Combates\",\"activa\":true,\"categorias\":{\"cinturon\":[{\"activa\":true,\"tipo\":\"individual\",\"valor\":\"Blanco\"},{\"activa\":true,\"tipo\":\"individual\",\"valor\":\"Amarillo\"},{\"activa\":true,\"tipo\":\"individual\",\"valor\":\"Naranja\"},{\"activa\":true,\"tipo\":\"individual\",\"valor\":\"Naranja/verde\"},{\"activa\":true,\"tipo\":\"individual\",\"valor\":\"Verde\"},{\"activa\":true,\"tipo\":\"individual\",\"valor\":\"Verde/azul\"},{\"activa\":true,\"tipo\":\"individual\",\"valor\":\"Azul\"},{\"activa\":true,\"tipo\":\"individual\",\"valor\":\"Rojo\"},{\"activa\":true,\"tipo\":\"individual\",\"valor\":\"Marrón\"},{\"activa\":true,\"tipo\":\"individual\",\"valor\":\"Marrón/negro\"},{\"activa\":true,\"tipo\":\"individual\",\"valor\":\"Negro\"}],\"genero\":\"individual\"}}]', '2026-02-15', '2026-02-22', '2026-01-30 16:41:50', 'BORRADOR', 0, 1, NULL, 'Andres Gonzalez', 1, '[{\"PESO\":\"SIN_PESO\",\"CINTURON\":\"Blanco\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-MASCULINO-BLANCO-NULL-SIN_PESO\"},{\"PESO\":\"SIN_PESO\",\"CINTURON\":\"Amarillo\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-MASCULINO-AMARILLO-NULL-SIN_PESO\"},{\"PESO\":\"SIN_PESO\",\"CINTURON\":\"Naranja\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-MASCULINO-NARANJA-NULL-SIN_PESO\"},{\"PESO\":\"SIN_PESO\",\"CINTURON\":\"Naranja/verde\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-MASCULINO-NARANJA/VERDE-NULL-SIN_PESO\"},{\"PESO\":\"SIN_PESO\",\"CINTURON\":\"Verde\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-MASCULINO-VERDE-NULL-SIN_PESO\"},{\"PESO\":\"SIN_PESO\",\"CINTURON\":\"Verde/azul\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-MASCULINO-VERDE/AZUL-NULL-SIN_PESO\"},{\"PESO\":\"SIN_PESO\",\"CINTURON\":\"Azul\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-MASCULINO-AZUL-NULL-SIN_PESO\"},{\"PESO\":\"SIN_PESO\",\"CINTURON\":\"Rojo\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-MASCULINO-ROJO-NULL-SIN_PESO\"},{\"PESO\":\"SIN_PESO\",\"CINTURON\":\"Marrón\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-MASCULINO-MARRÓN-NULL-SIN_PESO\"},{\"PESO\":\"SIN_PESO\",\"CINTURON\":\"Marrón/negro\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-MASCULINO-MARRÓN/NEGRO-NULL-SIN_PESO\"},{\"PESO\":\"SIN_PESO\",\"CINTURON\":\"Negro\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-MASCULINO-NEGRO-NULL-SIN_PESO\"},{\"PESO\":\"SIN_PESO\",\"CINTURON\":\"Blanco\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-FEMENINO-BLANCO-NULL-SIN_PESO\"},{\"PESO\":\"SIN_PESO\",\"CINTURON\":\"Amarillo\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-FEMENINO-AMARILLO-NULL-SIN_PESO\"},{\"PESO\":\"SIN_PESO\",\"CINTURON\":\"Naranja\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-FEMENINO-NARANJA-NULL-SIN_PESO\"},{\"PESO\":\"SIN_PESO\",\"CINTURON\":\"Naranja/verde\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-FEMENINO-NARANJA/VERDE-NULL-SIN_PESO\"},{\"PESO\":\"SIN_PESO\",\"CINTURON\":\"Verde\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-FEMENINO-VERDE-NULL-SIN_PESO\"},{\"PESO\":\"SIN_PESO\",\"CINTURON\":\"Verde/azul\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-FEMENINO-VERDE/AZUL-NULL-SIN_PESO\"},{\"PESO\":\"SIN_PESO\",\"CINTURON\":\"Azul\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-FEMENINO-AZUL-NULL-SIN_PESO\"},{\"PESO\":\"SIN_PESO\",\"CINTURON\":\"Rojo\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-FEMENINO-ROJO-NULL-SIN_PESO\"},{\"PESO\":\"SIN_PESO\",\"CINTURON\":\"Marrón\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-FEMENINO-MARRÓN-NULL-SIN_PESO\"},{\"PESO\":\"SIN_PESO\",\"CINTURON\":\"Marrón/negro\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-FEMENINO-MARRÓN/NEGRO-NULL-SIN_PESO\"},{\"PESO\":\"SIN_PESO\",\"CINTURON\":\"Negro\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-FEMENINO-NEGRO-NULL-SIN_PESO\"}]', '[\"COMBATES-MASCULINO-BLANCO-NULL-SIN_PESO\"]'),
(40, 'Inscripciones', 'calle 12 #43-81-1', 'Albania', 'Banaj', 'Regional', 12, 234, 1, 123456, '[{\"id\":\"combates\",\"nombre\":\"Combates\",\"activa\":true,\"categorias\":{\"cinturon\":[{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"Blanco\",\"hasta\":\"Naranja\"},{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"Naranja/verde\",\"hasta\":\"Rojo\"}],\"edad\":[{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"4\",\"hasta\":\"12\"}],\"peso\":[{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"10\",\"hasta\":\"20\"},{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"34\",\"hasta\":\"54\"},{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"55\",\"hasta\":\"60\"}],\"genero\":\"individual\"}},{\"id\":\"figura-armas\",\"nombre\":\"Figura con armas\",\"activa\":true,\"categorias\":{\"cinturon\":[{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"Blanco\",\"hasta\":\"Naranja\"},{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"Naranja/verde\",\"hasta\":\"Rojo\"}],\"edad\":[{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"4\",\"hasta\":\"12\"}],\"peso\":[{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"10\",\"hasta\":\"20\"},{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"34\",\"hasta\":\"54\"},{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"55\",\"hasta\":\"60\"}],\"genero\":\"individual\"}},{\"id\":\"figura-manos\",\"nombre\":\"Figura a manos libres\",\"activa\":true,\"categorias\":{\"cinturon\":[{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"Blanco\",\"hasta\":\"Naranja\"},{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"Naranja/verde\",\"hasta\":\"Rojo\"}],\"edad\":[{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"4\",\"hasta\":\"12\"}],\"peso\":[{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"10\",\"hasta\":\"20\"},{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"34\",\"hasta\":\"54\"},{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"55\",\"hasta\":\"60\"}],\"genero\":\"individual\"}},{\"id\":\"defensa-personal\",\"nombre\":\"Defensa personal\",\"activa\":true,\"categorias\":{\"cinturon\":[{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"Blanco\",\"hasta\":\"Naranja\"},{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"Naranja/verde\",\"hasta\":\"Rojo\"}],\"edad\":[{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"4\",\"hasta\":\"12\"}],\"peso\":[{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"10\",\"hasta\":\"20\"},{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"34\",\"hasta\":\"54\"},{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"55\",\"hasta\":\"60\"}],\"genero\":\"individual\"}},{\"id\":\"salto-alto\",\"nombre\":\"Salto alto\",\"activa\":true,\"categorias\":{\"cinturon\":[{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"Blanco\",\"hasta\":\"Naranja\"},{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"Naranja/verde\",\"hasta\":\"Rojo\"}],\"edad\":[{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"4\",\"hasta\":\"12\"}],\"peso\":[{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"10\",\"hasta\":\"20\"},{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"34\",\"hasta\":\"54\"},{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"55\",\"hasta\":\"60\"}],\"genero\":\"individual\"}},{\"id\":\"salto-largo\",\"nombre\":\"Salto largo\",\"activa\":true,\"categorias\":{\"cinturon\":[{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"Blanco\",\"hasta\":\"Naranja\"},{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"Naranja/verde\",\"hasta\":\"Rojo\"}],\"edad\":[{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"4\",\"hasta\":\"12\"}],\"peso\":[{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"10\",\"hasta\":\"20\"},{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"34\",\"hasta\":\"54\"},{\"activa\":true,\"tipo\":\"rango\",\"desde\":\"55\",\"hasta\":\"60\"}],\"genero\":\"individual\"}}]', '2026-02-09', '2026-02-21', '2026-01-30 17:12:07', 'BORRADOR', 0, 1, NULL, 'Andres Gonzalez', 1, '[{\"PESO\":\"10-20\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-MASCULINO-BLANCO-NARANJA-EDAD(4-12)-PESO(10-20)\"},{\"PESO\":\"34-54\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-MASCULINO-BLANCO-NARANJA-EDAD(4-12)-PESO(34-54)\"},{\"PESO\":\"55-60\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-MASCULINO-BLANCO-NARANJA-EDAD(4-12)-PESO(55-60)\"},{\"PESO\":\"10-20\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-MASCULINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(10-20)\"},{\"PESO\":\"34-54\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-MASCULINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(34-54)\"},{\"PESO\":\"55-60\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-MASCULINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(55-60)\"},{\"PESO\":\"10-20\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-FEMENINO-BLANCO-NARANJA-EDAD(4-12)-PESO(10-20)\"},{\"PESO\":\"34-54\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-FEMENINO-BLANCO-NARANJA-EDAD(4-12)-PESO(34-54)\"},{\"PESO\":\"55-60\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-FEMENINO-BLANCO-NARANJA-EDAD(4-12)-PESO(55-60)\"},{\"PESO\":\"10-20\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-FEMENINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(10-20)\"},{\"PESO\":\"34-54\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-FEMENINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(34-54)\"},{\"PESO\":\"55-60\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Combates\",\"RAIZ\":\"Campeonato\",\"ID\":\"COMBATES-FEMENINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(55-60)\"},{\"PESO\":\"10-20\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Figura con armas\",\"RAIZ\":\"Campeonato\",\"ID\":\"FIGURA_CON_ARMAS-MASCULINO-BLANCO-NARANJA-EDAD(4-12)-PESO(10-20)\"},{\"PESO\":\"34-54\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Figura con armas\",\"RAIZ\":\"Campeonato\",\"ID\":\"FIGURA_CON_ARMAS-MASCULINO-BLANCO-NARANJA-EDAD(4-12)-PESO(34-54)\"},{\"PESO\":\"55-60\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Figura con armas\",\"RAIZ\":\"Campeonato\",\"ID\":\"FIGURA_CON_ARMAS-MASCULINO-BLANCO-NARANJA-EDAD(4-12)-PESO(55-60)\"},{\"PESO\":\"10-20\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Figura con armas\",\"RAIZ\":\"Campeonato\",\"ID\":\"FIGURA_CON_ARMAS-MASCULINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(10-20)\"},{\"PESO\":\"34-54\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Figura con armas\",\"RAIZ\":\"Campeonato\",\"ID\":\"FIGURA_CON_ARMAS-MASCULINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(34-54)\"},{\"PESO\":\"55-60\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Figura con armas\",\"RAIZ\":\"Campeonato\",\"ID\":\"FIGURA_CON_ARMAS-MASCULINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(55-60)\"},{\"PESO\":\"10-20\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Figura con armas\",\"RAIZ\":\"Campeonato\",\"ID\":\"FIGURA_CON_ARMAS-FEMENINO-BLANCO-NARANJA-EDAD(4-12)-PESO(10-20)\"},{\"PESO\":\"34-54\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Figura con armas\",\"RAIZ\":\"Campeonato\",\"ID\":\"FIGURA_CON_ARMAS-FEMENINO-BLANCO-NARANJA-EDAD(4-12)-PESO(34-54)\"},{\"PESO\":\"55-60\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Figura con armas\",\"RAIZ\":\"Campeonato\",\"ID\":\"FIGURA_CON_ARMAS-FEMENINO-BLANCO-NARANJA-EDAD(4-12)-PESO(55-60)\"},{\"PESO\":\"10-20\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Figura con armas\",\"RAIZ\":\"Campeonato\",\"ID\":\"FIGURA_CON_ARMAS-FEMENINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(10-20)\"},{\"PESO\":\"34-54\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Figura con armas\",\"RAIZ\":\"Campeonato\",\"ID\":\"FIGURA_CON_ARMAS-FEMENINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(34-54)\"},{\"PESO\":\"55-60\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Figura con armas\",\"RAIZ\":\"Campeonato\",\"ID\":\"FIGURA_CON_ARMAS-FEMENINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(55-60)\"},{\"PESO\":\"10-20\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Figura a manos libres\",\"RAIZ\":\"Campeonato\",\"ID\":\"FIGURA_A_MANOS_LIBRES-MASCULINO-BLANCO-NARANJA-EDAD(4-12)-PESO(10-20)\"},{\"PESO\":\"34-54\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Figura a manos libres\",\"RAIZ\":\"Campeonato\",\"ID\":\"FIGURA_A_MANOS_LIBRES-MASCULINO-BLANCO-NARANJA-EDAD(4-12)-PESO(34-54)\"},{\"PESO\":\"55-60\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Figura a manos libres\",\"RAIZ\":\"Campeonato\",\"ID\":\"FIGURA_A_MANOS_LIBRES-MASCULINO-BLANCO-NARANJA-EDAD(4-12)-PESO(55-60)\"},{\"PESO\":\"10-20\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Figura a manos libres\",\"RAIZ\":\"Campeonato\",\"ID\":\"FIGURA_A_MANOS_LIBRES-MASCULINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(10-20)\"},{\"PESO\":\"34-54\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Figura a manos libres\",\"RAIZ\":\"Campeonato\",\"ID\":\"FIGURA_A_MANOS_LIBRES-MASCULINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(34-54)\"},{\"PESO\":\"55-60\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Figura a manos libres\",\"RAIZ\":\"Campeonato\",\"ID\":\"FIGURA_A_MANOS_LIBRES-MASCULINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(55-60)\"},{\"PESO\":\"10-20\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Figura a manos libres\",\"RAIZ\":\"Campeonato\",\"ID\":\"FIGURA_A_MANOS_LIBRES-FEMENINO-BLANCO-NARANJA-EDAD(4-12)-PESO(10-20)\"},{\"PESO\":\"34-54\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Figura a manos libres\",\"RAIZ\":\"Campeonato\",\"ID\":\"FIGURA_A_MANOS_LIBRES-FEMENINO-BLANCO-NARANJA-EDAD(4-12)-PESO(34-54)\"},{\"PESO\":\"55-60\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Figura a manos libres\",\"RAIZ\":\"Campeonato\",\"ID\":\"FIGURA_A_MANOS_LIBRES-FEMENINO-BLANCO-NARANJA-EDAD(4-12)-PESO(55-60)\"},{\"PESO\":\"10-20\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Figura a manos libres\",\"RAIZ\":\"Campeonato\",\"ID\":\"FIGURA_A_MANOS_LIBRES-FEMENINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(10-20)\"},{\"PESO\":\"34-54\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Figura a manos libres\",\"RAIZ\":\"Campeonato\",\"ID\":\"FIGURA_A_MANOS_LIBRES-FEMENINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(34-54)\"},{\"PESO\":\"55-60\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Figura a manos libres\",\"RAIZ\":\"Campeonato\",\"ID\":\"FIGURA_A_MANOS_LIBRES-FEMENINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(55-60)\"},{\"PESO\":\"10-20\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Defensa personal\",\"RAIZ\":\"Campeonato\",\"ID\":\"DEFENSA_PERSONAL-MASCULINO-BLANCO-NARANJA-EDAD(4-12)-PESO(10-20)\"},{\"PESO\":\"34-54\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Defensa personal\",\"RAIZ\":\"Campeonato\",\"ID\":\"DEFENSA_PERSONAL-MASCULINO-BLANCO-NARANJA-EDAD(4-12)-PESO(34-54)\"},{\"PESO\":\"55-60\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Defensa personal\",\"RAIZ\":\"Campeonato\",\"ID\":\"DEFENSA_PERSONAL-MASCULINO-BLANCO-NARANJA-EDAD(4-12)-PESO(55-60)\"},{\"PESO\":\"10-20\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Defensa personal\",\"RAIZ\":\"Campeonato\",\"ID\":\"DEFENSA_PERSONAL-MASCULINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(10-20)\"},{\"PESO\":\"34-54\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Defensa personal\",\"RAIZ\":\"Campeonato\",\"ID\":\"DEFENSA_PERSONAL-MASCULINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(34-54)\"},{\"PESO\":\"55-60\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Defensa personal\",\"RAIZ\":\"Campeonato\",\"ID\":\"DEFENSA_PERSONAL-MASCULINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(55-60)\"},{\"PESO\":\"10-20\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Defensa personal\",\"RAIZ\":\"Campeonato\",\"ID\":\"DEFENSA_PERSONAL-FEMENINO-BLANCO-NARANJA-EDAD(4-12)-PESO(10-20)\"},{\"PESO\":\"34-54\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Defensa personal\",\"RAIZ\":\"Campeonato\",\"ID\":\"DEFENSA_PERSONAL-FEMENINO-BLANCO-NARANJA-EDAD(4-12)-PESO(34-54)\"},{\"PESO\":\"55-60\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Defensa personal\",\"RAIZ\":\"Campeonato\",\"ID\":\"DEFENSA_PERSONAL-FEMENINO-BLANCO-NARANJA-EDAD(4-12)-PESO(55-60)\"},{\"PESO\":\"10-20\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Defensa personal\",\"RAIZ\":\"Campeonato\",\"ID\":\"DEFENSA_PERSONAL-FEMENINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(10-20)\"},{\"PESO\":\"34-54\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Defensa personal\",\"RAIZ\":\"Campeonato\",\"ID\":\"DEFENSA_PERSONAL-FEMENINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(34-54)\"},{\"PESO\":\"55-60\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Defensa personal\",\"RAIZ\":\"Campeonato\",\"ID\":\"DEFENSA_PERSONAL-FEMENINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(55-60)\"},{\"PESO\":\"10-20\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Salto alto\",\"RAIZ\":\"Campeonato\",\"ID\":\"SALTO_ALTO-MASCULINO-BLANCO-NARANJA-EDAD(4-12)-PESO(10-20)\"},{\"PESO\":\"34-54\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Salto alto\",\"RAIZ\":\"Campeonato\",\"ID\":\"SALTO_ALTO-MASCULINO-BLANCO-NARANJA-EDAD(4-12)-PESO(34-54)\"},{\"PESO\":\"55-60\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Salto alto\",\"RAIZ\":\"Campeonato\",\"ID\":\"SALTO_ALTO-MASCULINO-BLANCO-NARANJA-EDAD(4-12)-PESO(55-60)\"},{\"PESO\":\"10-20\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Salto alto\",\"RAIZ\":\"Campeonato\",\"ID\":\"SALTO_ALTO-MASCULINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(10-20)\"},{\"PESO\":\"34-54\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Salto alto\",\"RAIZ\":\"Campeonato\",\"ID\":\"SALTO_ALTO-MASCULINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(34-54)\"},{\"PESO\":\"55-60\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Salto alto\",\"RAIZ\":\"Campeonato\",\"ID\":\"SALTO_ALTO-MASCULINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(55-60)\"},{\"PESO\":\"10-20\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Salto alto\",\"RAIZ\":\"Campeonato\",\"ID\":\"SALTO_ALTO-FEMENINO-BLANCO-NARANJA-EDAD(4-12)-PESO(10-20)\"},{\"PESO\":\"34-54\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Salto alto\",\"RAIZ\":\"Campeonato\",\"ID\":\"SALTO_ALTO-FEMENINO-BLANCO-NARANJA-EDAD(4-12)-PESO(34-54)\"},{\"PESO\":\"55-60\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Salto alto\",\"RAIZ\":\"Campeonato\",\"ID\":\"SALTO_ALTO-FEMENINO-BLANCO-NARANJA-EDAD(4-12)-PESO(55-60)\"},{\"PESO\":\"10-20\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Salto alto\",\"RAIZ\":\"Campeonato\",\"ID\":\"SALTO_ALTO-FEMENINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(10-20)\"},{\"PESO\":\"34-54\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Salto alto\",\"RAIZ\":\"Campeonato\",\"ID\":\"SALTO_ALTO-FEMENINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(34-54)\"},{\"PESO\":\"55-60\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Salto alto\",\"RAIZ\":\"Campeonato\",\"ID\":\"SALTO_ALTO-FEMENINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(55-60)\"},{\"PESO\":\"10-20\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Salto largo\",\"RAIZ\":\"Campeonato\",\"ID\":\"SALTO_LARGO-MASCULINO-BLANCO-NARANJA-EDAD(4-12)-PESO(10-20)\"},{\"PESO\":\"34-54\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Salto largo\",\"RAIZ\":\"Campeonato\",\"ID\":\"SALTO_LARGO-MASCULINO-BLANCO-NARANJA-EDAD(4-12)-PESO(34-54)\"},{\"PESO\":\"55-60\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Salto largo\",\"RAIZ\":\"Campeonato\",\"ID\":\"SALTO_LARGO-MASCULINO-BLANCO-NARANJA-EDAD(4-12)-PESO(55-60)\"},{\"PESO\":\"10-20\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Salto largo\",\"RAIZ\":\"Campeonato\",\"ID\":\"SALTO_LARGO-MASCULINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(10-20)\"},{\"PESO\":\"34-54\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Salto largo\",\"RAIZ\":\"Campeonato\",\"ID\":\"SALTO_LARGO-MASCULINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(34-54)\"},{\"PESO\":\"55-60\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Masculino\",\"MODALIDAD\":\"Salto largo\",\"RAIZ\":\"Campeonato\",\"ID\":\"SALTO_LARGO-MASCULINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(55-60)\"},{\"PESO\":\"10-20\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Salto largo\",\"RAIZ\":\"Campeonato\",\"ID\":\"SALTO_LARGO-FEMENINO-BLANCO-NARANJA-EDAD(4-12)-PESO(10-20)\"},{\"PESO\":\"34-54\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Salto largo\",\"RAIZ\":\"Campeonato\",\"ID\":\"SALTO_LARGO-FEMENINO-BLANCO-NARANJA-EDAD(4-12)-PESO(34-54)\"},{\"PESO\":\"55-60\",\"EDAD\":\"4-12\",\"CINTURON\":\"Blanco-Naranja\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Salto largo\",\"RAIZ\":\"Campeonato\",\"ID\":\"SALTO_LARGO-FEMENINO-BLANCO-NARANJA-EDAD(4-12)-PESO(55-60)\"},{\"PESO\":\"10-20\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Salto largo\",\"RAIZ\":\"Campeonato\",\"ID\":\"SALTO_LARGO-FEMENINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(10-20)\"},{\"PESO\":\"34-54\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Salto largo\",\"RAIZ\":\"Campeonato\",\"ID\":\"SALTO_LARGO-FEMENINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(34-54)\"},{\"PESO\":\"55-60\",\"EDAD\":\"4-12\",\"CINTURON\":\"Naranja/verde-Rojo\",\"GENERO\":\"Femenino\",\"MODALIDAD\":\"Salto largo\",\"RAIZ\":\"Campeonato\",\"ID\":\"SALTO_LARGO-FEMENINO-NARANJA/VERDE-ROJO-EDAD(4-12)-PESO(55-60)\"}]', '[\"COMBATES-MASCULINO-BLANCO-NARANJA-EDAD(4-12)-PESO(10-20)\",\"FIGURA_CON_ARMAS-MASCULINO-BLANCO-NARANJA-EDAD(4-12)-PESO(10-20)\",\"FIGURA_A_MANOS_LIBRES-MASCULINO-BLANCO-NARANJA-EDAD(4-12)-PESO(10-20)\",\"SALTO_LARGO-MASCULINO-BLANCO-NARANJA-EDAD(4-12)-PESO(10-20)\",\"SALTO_ALTO-MASCULINO-BLANCO-NARANJA-EDAD(4-12)-PESO(10-20)\",\"DEFENSA_PERSONAL-MASCULINO-BLANCO-NARANJA-EDAD(4-12)-PESO(10-20)\"]');

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
  `idusuario` bigint(11) DEFAULT NULL,
  `idcampeonato` bigint(11) DEFAULT NULL,
  `secciones` longtext DEFAULT NULL,
  `tipousuario` int(11) DEFAULT NULL,
  `estado` tinyint(4) DEFAULT 2,
  `fecha_inscripcion` datetime(6) DEFAULT current_timestamp(6),
  `invitado` tinyint(1) NOT NULL DEFAULT 0,
  `visible` bit(1) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `inscripciones`
--

INSERT INTO `inscripciones` (`idinscripcion`, `idusuario`, `idcampeonato`, `secciones`, `tipousuario`, `estado`, `fecha_inscripcion`, `invitado`, `visible`) VALUES
(1, 1, 40, '[\"SALTO_LARGO-MASCULINO-BLANCO-NARANJA-EDAD(4-12)-PESO(10-20)\",\"COMBATES-MASCULINO-BLANCO-NARANJA-EDAD(4-12)-PESO(10-20)\",\"SALTO_ALTO-MASCULINO-BLANCO-NARANJA-EDAD(4-12)-PESO(10-20)\",\"DEFENSA_PERSONAL-MASCULINO-BLANCO-NARANJA-EDAD(4-12)-PESO(10-20)\"]', 5, 2, '2026-02-03 18:17:49.000000', 0, b'1'),
(9, 43013, 40, NULL, 8, 3, NULL, 1, b'1'),
(10, 7868776876, 40, NULL, 5, 2, NULL, 1, b'0'),
(11, 2, 40, NULL, 5, 2, NULL, 1, b'1'),
(14, 43013, 39, NULL, 8, 2, '2026-02-03 18:27:44.000000', 1, b'1');

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
(5, 'competidor'),
(6, 'juez Central'),
(7, 'juez de mesa'),
(8, 'juez'),
(9, 'coach');

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
  `tipo_usuario` int(11) DEFAULT NULL,
  `estado` tinyint(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `usuario`
--

INSERT INTO `usuario` (`ID_documento`, `nombreC`, `sexo`, `fecha_nacimiento`, `cinturon_rango`, `Nacionalidad`, `ciudad`, `Correo`, `Contraseña`, `numero_celular`, `Instructor`, `academia`, `tipo_usuario`, `estado`) VALUES
(0, 'Independiente', 'Masculino', '2016-01-01', 'Amarillo', 'colombia', '', 'nada@gmail.com', '1', '+572', NULL, 0, 2, 0),
(1, 'Instructor 1', 'Masculino', '2016-01-01', 'Blanco', 'colombia', '', 'a@gmail.com', '1', '+571', 4, 1, 2, 1),
(2, 'instructor 2', 'Masculino', '2019-04-04', 'Negro', 'colombia', 'Cúcuta', 'e@gmail.com', '1', '2', 0, 2, 2, 1),
(4, 'Instructor 2', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, 1, 2, 1),
(43013, 'AMIR SARMIENTO', 'Masculino', '2020-04-02', 'Blanco', 'Colombia', NULL, 'amirsarmiento0430@gmail.com', '1', '+570430', 0, 0, 3, 1),
(123456, 'Andres Gonzalez', 'Masculino', '2019-04-04', 'Negro', 'Colombia', 'Cúcuta', 'andresivan0807@gmail.com', '1', '+573243100882', 0, 0, 3, 1),
(7868776876, 'AMIR SARMIENTOQ', 'Masculino', '2019-04-03', 'Blanco', 'Albania', NULL, 'amirdaniel0430@gmail.com', '1', '+13', 1, 1, 4, 1);

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
  ADD KEY `idusuario` (`idusuario`,`idcampeonato`) USING BTREE,
  ADD KEY `estado` (`estado`) USING BTREE,
  ADD KEY `idcampeonato` (`idcampeonato`) USING BTREE,
  ADD KEY `tipoUsuario` (`tipousuario`);

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
  ADD KEY `academia` (`academia`) USING BTREE,
  ADD KEY `estado` (`estado`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `campeonato`
--
ALTER TABLE `campeonato`
  MODIFY `id_campeonato` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=41;

--
-- AUTO_INCREMENT de la tabla `inscripciones`
--
ALTER TABLE `inscripciones`
  MODIFY `idinscripcion` bigint(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=15;

--
-- AUTO_INCREMENT de la tabla `tipo_usuario`
--
ALTER TABLE `tipo_usuario`
  MODIFY `ID_Tipo` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

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
  ADD CONSTRAINT `inscripciones_ibfk_3` FOREIGN KEY (`idcampeonato`) REFERENCES `campeonato` (`id_campeonato`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `inscripciones_ibfk_4` FOREIGN KEY (`tipoUsuario`) REFERENCES `tipo_usuario` (`ID_Tipo`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `inscripciones_ibfk_5` FOREIGN KEY (`tipousuario`) REFERENCES `tipo_usuario` (`ID_Tipo`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Filtros para la tabla `usuario`
--
ALTER TABLE `usuario`
  ADD CONSTRAINT `fk_usuario_academia` FOREIGN KEY (`academia`) REFERENCES `academia` (`ID_academia`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_usuario_instructor` FOREIGN KEY (`Instructor`) REFERENCES `usuario` (`ID_documento`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_usuario_tipo` FOREIGN KEY (`tipo_usuario`) REFERENCES `tipo_usuario` (`ID_Tipo`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `usuario_ibfk_1` FOREIGN KEY (`estado`) REFERENCES `estado` (`idvisible`) ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
