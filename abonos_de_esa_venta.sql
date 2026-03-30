-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Servidor: localhost:3306
-- Tiempo de generación: 29-03-2026 a las 10:36:12
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
-- Estructura de tabla para la tabla `a`
--

CREATE TABLE `a` (
  `legacy_payment_id` int(11) NOT NULL,
  `legacy_sale_id` int(10) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `paid_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `legacy_payment_method_raw` varchar(1) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_spanish_ci;

--
-- Volcado de datos para la tabla `a`
--

INSERT INTO `a` (`legacy_payment_id`, `legacy_sale_id`, `paid_at`, `amount`, `payment_method`, `legacy_payment_method_raw`) VALUES
(21491, 25548, '2024-08-07 13:50:57', 11300.00, 'OTRO', ''),
(24631, 28959, '2025-02-24 13:27:40', 200.00, 'EFECTIVO', 'e'),
(25017, 28959, '2025-03-11 21:05:15', 500.00, 'EFECTIVO', 'e'),
(25704, 28959, '2025-04-08 15:32:46', 500.00, 'EFECTIVO', 'e'),
(28829, 31000, '2025-10-15 20:15:04', 13160.00, 'EFECTIVO', 'e'),
(28102, 31969, '2025-08-29 22:35:46', 435.00, 'EFECTIVO', 'e'),
(31037, 31969, '2026-03-05 19:46:30', 400.00, 'EFECTIVO', 'e'),
(30523, 32569, '2026-02-02 21:54:35', 3815.00, 'TARJETA', 't'),
(30225, 33618, '2026-01-13 19:41:39', 215.00, 'EFECTIVO', 'e'),
(30681, 33618, '2026-02-10 19:44:14', 500.00, 'EFECTIVO', 'e'),
(30795, 33618, '2026-02-23 21:38:48', 500.00, 'EFECTIVO', 'e'),
(30314, 33728, '2026-01-19 15:36:28', 500.00, 'EFECTIVO', 'e'),
(30515, 33728, '2026-02-02 20:15:29', 500.00, 'EFECTIVO', 'e'),
(30528, 33780, '2026-02-02 21:57:42', 7905.00, 'TARJETA', 't'),
(30869, 33781, '2026-03-02 14:16:38', 220.00, 'EFECTIVO', 'e'),
(30286, 33849, '2026-01-15 13:59:40', 19000.00, 'EFECTIVO', 'e'),
(30683, 33849, '2026-02-11 13:29:59', 10000.00, 'EFECTIVO', 'e'),
(30870, 33849, '2026-03-02 14:16:57', 9000.00, 'EFECTIVO', 'e'),
(31228, 33849, '2026-03-17 15:05:40', 1200.00, 'EFECTIVO', 'e'),
(30529, 33988, '2026-02-02 21:58:36', 1270.00, 'TARJETA', 't'),
(30531, 34124, '2026-02-02 21:59:19', 1270.00, 'TARJETA', 't'),
(30532, 34230, '2026-02-02 21:59:54', 2075.00, 'TARJETA', 't'),
(31099, 34318, '2026-03-10 14:01:32', 2911.00, 'EFECTIVO', 'e'),
(31040, 34661, '2026-03-05 19:49:13', 4494.00, 'EFECTIVO', 'e'),
(30534, 34837, '2026-02-02 22:01:15', 2375.00, 'TARJETA', 't'),
(30512, 34911, '2026-02-02 20:09:47', 3280.00, 'EFECTIVO', 'e'),
(31333, 34952, '2026-03-19 22:27:35', 490.00, 'EFECTIVO', 'e'),
(31309, 34964, '2026-03-19 17:06:47', 7740.00, 'TARJETA', 't'),
(30554, 35016, '2026-02-04 14:30:00', 132924.00, 'TARJETA', 't'),
(31043, 35016, '2026-03-05 19:59:28', 3800.00, 'OTRO', ''),
(30759, 35031, '2026-02-19 22:13:32', 3725.00, 'OTRO', ''),
(31098, 35063, '2026-03-10 14:00:56', 1584.00, 'EFECTIVO', 'e'),
(30703, 35184, '2026-02-12 18:07:42', 133950.00, 'TARJETA', 't'),
(31044, 35184, '2026-03-05 19:59:53', 304.00, 'OTRO', ''),
(31230, 35278, '2026-03-17 15:08:03', 47519.50, 'EFECTIVO', 'e'),
(31368, 35471, '2026-03-23 15:58:02', 34000.00, 'EFECTIVO', 'e'),
(31038, 35548, '2026-03-05 19:47:17', 1000.00, 'EFECTIVO', 'e'),
(31445, 35558, '2026-03-28 13:58:20', 11130.00, 'TARJETA', 't'),
(31447, 35558, '2026-03-28 13:58:33', 29400.00, 'TARJETA', 't'),
(31448, 35558, '2026-03-28 13:58:50', 12464.00, 'TARJETA', 't'),
(31310, 35763, '2026-03-19 17:07:35', 5100.00, 'EFECTIVO', 'e'),
(31229, 35768, '2026-03-17 15:06:51', 8400.00, 'EFECTIVO', 'e'),
(31378, 35969, '2026-03-25 14:26:20', 112499.55, 'TARJETA', 't'),
(31467, 36007, '2026-03-28 15:29:41', 8300.00, 'EFECTIVO', 'e'),
(31468, 36039, '2026-03-28 15:31:43', 144820.00, 'EFECTIVO', 'e');

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `a`
--
ALTER TABLE `a`
  ADD PRIMARY KEY (`legacy_payment_id`),
  ADD KEY `fk_abonos_ventas` (`legacy_sale_id`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `a`
--
ALTER TABLE `a`
  MODIFY `legacy_payment_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=31469;

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `a`
--
ALTER TABLE `a`
  ADD CONSTRAINT `fk_abonos_ventas` FOREIGN KEY (`legacy_sale_id`) REFERENCES `ventas` (`idventa`) ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
