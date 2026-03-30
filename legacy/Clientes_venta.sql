-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Servidor: localhost:3306
-- Tiempo de generación: 29-03-2026 a las 12:40:26
-- Versión del servidor: 10.6.24-MariaDB-cll-lve-log
-- Versión de PHP: 8.4.18

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `estribad_pventa`
--

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `c`
--
-- Error leyendo la estructura de la tabla estribad_pventa.c: #1146 - La tabla &#039;estribad_pventa.c&#039; no existe

--
-- Volcado de datos para la tabla `c`
--

INSERT INTO `c` (`legacy_customer_id`, `customer_name`, `phone`, `address`, `credit_limit`, `legacy_credit_used`, `default_credit_days`, `legacy_status`) VALUES
(1646, 'ALEJANDRO LOPEZ', '(000) 000-00-00', 'DEGOLLADO', 42000.00, -46394.00, 30, 1),
(1678, 'CLADIMACO', '(311) 263-02-60', 'TEPIC, NAYARIT', 300000.00, -134292.00, 15, 1),
(619, 'CHRISTOPHER DURAN', '(322) 213-28-05', 'hidalgo 131', 250000.00, -5904.73, 30, 1),
(804, 'DAVID REYES', '(000) 000-00-00', 'ABELARDO RODRIGUEZ #292', 56000.00, -2339.00, 15, 1),
(1659, 'ESTEBAN BRAVO', '(000) 000-00-00', 'BUENOS AIRES', 60000.00, 50.00, 30, 1),
(325, 'JAIME LOPEZ', '(000) 0__-__-__', 'CONOCIDO', 100000.00, 27635.00, 30, 1),
(107, 'JAIME LOPEZ CANGO', '(000) ___-__-__', 'CONOCIDO', 150000.00, 104641.70, 30, 1),
(1357, 'JUAN ANTONIO LEDESMA', '(348) 121-44-4_', 'DEG', 50000.00, 5570.00, 15, 1),
(373, 'juan manuel madrigal (meño)', '(348) 152-93-02', 'los fresnos', 20000.00, -14112.00, 30, 1),
(1663, 'LUZ MARIA HERNANDEZ', '(000) 000-00-00', 'EL MEZQUITE', 40000.00, 23474.00, 30, 1),
(187, 'PUBLICO EN GENERAL', '(000) 0__-__-__', 'DEGOLLADO', 150000.00, 91490.25, 15, 1);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
