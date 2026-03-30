-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Servidor: localhost:3306
-- Tiempo de generación: 29-03-2026 a las 12:42:35
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
(24631, 28959, '2025-02-24 13:27:40', 200.00, 'EFECTIVO', 'e'),
(25017, 28959, '2025-03-11 21:05:15', 500.00, 'EFECTIVO', 'e'),
(25704, 28959, '2025-04-08 15:32:46', 500.00, 'EFECTIVO', 'e'),
(30286, 33849, '2026-01-15 13:59:40', 19000.00, 'EFECTIVO', 'e'),
(30683, 33849, '2026-02-11 13:29:59', 10000.00, 'EFECTIVO', 'e'),
(30870, 33849, '2026-03-02 14:16:57', 9000.00, 'EFECTIVO', 'e'),
(31228, 33849, '2026-03-17 15:05:40', 1200.00, 'EFECTIVO', 'e'),
(31040, 34661, '2026-03-05 19:49:13', 4494.00, 'EFECTIVO', 'e'),
(30554, 35016, '2026-02-04 14:30:00', 132924.00, 'TARJETA', 't'),
(31043, 35016, '2026-03-05 19:59:28', 3800.00, 'OTRO', ''),
(30703, 35184, '2026-02-12 18:07:42', 133950.00, 'TARJETA', 't'),
(31044, 35184, '2026-03-05 19:59:53', 304.00, 'OTRO', '');

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
