-- Actualizacion de productos Casa Tahona desde CSV exportado.
-- Ejecutar en la base de datos de VINOS / Casa Tahona.
-- No crea productos, categorias, unidades, sucursales ni stocks nuevos.
-- Solo actualiza productos/product_uoms/product_stocks que ya existan y hagan match.
-- Recomendacion: primero ejecuta en staging o cambia COMMIT por ROLLBACK para revisar el resumen.

begin;

create temp table _vinos_productos_csv (
  row_no integer,
  nombre text,
  codigo_sku text,
  codigo_barras text,
  categoria text,
  sucursal text,
  stock_sucursal numeric,
  stock_minimo numeric,
  unidad_medida text,
  factor_to_base numeric,
  precio_menudeo numeric,
  precio_medio_mayoreo numeric,
  precio_mayoreo numeric,
  activo boolean
) on commit drop;

insert into _vinos_productos_csv (
  row_no, nombre, codigo_sku, codigo_barras, categoria, sucursal,
  stock_sucursal, stock_minimo, unidad_medida, factor_to_base,
  precio_menudeo, precio_medio_mayoreo, precio_mayoreo, activo
)
values
  (1, '1800 MILENIO 700ml', 'PRO-579663', '7501035013476', 'COLECCION', 'VINOS - Principal', 1, 1, 'Botella', 1, 3000, 2880, 2760, true),
  (2, '7 Leguas BLANCO 1L', 'PRO-271873', '7501151010014', 'Tequila', 'VINOS - Principal', 71, 10, 'Botella', 1, 800, 768, 736, true),
  (3, '7 Leguas Blanco 700ml', 'PRO-145125', '7501151070018', 'Tequila', 'VINOS - Principal', 35, 10, 'Botella', 1, 675, 648, 621, true),
  (4, 'absolut mandrin 750ml', 'PRO-969288', '7312040050758', 'Vodka', 'VINOS - Principal', 9, 6, 'Botella', 1, 218.75, 210, 201.25, true),
  (5, 'Absolut raspeberry 750ml', 'PRO-865556', '7312040350063', 'Vodka', 'VINOS - Principal', 12, 6, 'Botella', 1, 218.75, 210, 201.25, true),
  (6, 'absolut VODKA 750ml', 'PRO-050110', '7312040017010', 'Vodka', 'VINOS - Principal', 12, 6, 'Botella', 1, 218.75, 210, 201.25, true),
  (7, 'Amper 473 ml', 'PRO-470533', '7506192507349', null, 'VINOS - Principal', 200, 12, 'Pieza', 1, 18.95, 18.19, 17.43, true),
  (8, 'arizona KIWI FRESA 570ml', 'PRO-190567', '613008772901', 'Jugos', 'VINOS - Principal', 71, 10, 'Pieza', 1, 21.08, 20.24, 19.4, true),
  (9, 'arizona MANGO 570ml', 'PRO-092601', '613008772963', 'Jugos', 'VINOS - Principal', 57, 10, 'Pieza', 1, 21.08, 20.24, 19.4, true),
  (10, 'arizona PONCHE DE FRUTAS 570ml', 'PRO-281964', '613008772871', 'Jugos', 'VINOS - Principal', 16, 10, 'Pieza', 1, 21.08, 20.24, 19.4, true),
  (11, 'arizona SANDIA 570ml', 'PRO-404429', '613008772840', 'Jugos', 'VINOS - Principal', 72, 10, 'Pieza', 1, 21.08, 20.24, 19.4, true),
  (12, 'bacardi CARTA BLANCA 980ML', 'PRO-840764', '7501008660201', 'Ron', 'VINOS - Principal', 24, 10, 'Botella', 1, 225, 216, 207, true),
  (13, 'BACARDI RASPBERRY 700ml', 'PRO-074502', '7610113028421', 'Ron', 'VINOS - Principal', 24, 10, 'Botella', 1, 193.75, 186, 1787.25, true),
  (14, 'baileys 700ml', 'PRO-441791', '5011013100156', 'licor', 'VINOS - Principal', 24, 10, 'Botella', 1, 393.75, 378, 362.25, true),
  (15, 'Black Label 750ml', 'PRO-555898', '5000267024004', 'Whisky', 'VINOS - Principal', 11, 6, 'Botella', 1, 562.5, 540, 517.4, true),
  (16, 'black y white 700ml', 'PRO-203949', '50196135', 'Whisky', 'VINOS - Principal', 12, 6, 'Botella', 1, 212.5, 204, 195.5, true),
  (17, 'blue label 750ml', 'PRO-713257', '5000267114279', 'COLECCION', 'VINOS - Principal', 1, 1, 'Botella', 1, 4312.5, 4140, 3967.5, true),
  (18, 'Boing brik de Fresa 500 ml', 'PRO-270673', '75003166', null, 'VINOS - Principal', 48, 48, 'Pieza', 1, 17.34, 16.64, 15.95, true),
  (19, 'Boing Brik Guayaba 500 ml', 'PRO-427350', '7501039401149', null, 'VINOS - Principal', 48, 48, 'Pieza', 1, 17.34, 16.64, 15.95, true),
  (20, 'boing GUAYABA 354ml', 'PRO-221711', '7501039400081', 'Jugos', 'VINOS - Principal', 48, 10, 'Pieza', 1, 18.12, 17.4, 16.68, true),
  (21, 'boing MANGO 354ml', 'PRO-374254', '7501039400067', 'Jugos', 'VINOS - Principal', 48, 10, 'Pieza', 1, 18.12, 17.4, 16.68, true),
  (22, 'bombay sapphire', 'PRO-111688', '5010677714006', 'licor', 'VINOS - Principal', 12, 6, 'Botella', 1, 425, 408, 391, true),
  (23, 'Bong brik de Mango 500 ml', 'PRO-330321', '7501039401132', null, 'VINOS - Principal', 48, 48, 'Pieza', 1, 17.44, 16.74, 16.04, true),
  (24, 'Boost 235 ml', 'PRO-401892', '7501013100730', null, 'VINOS - Principal', 120, 120, 'Pieza', 1, 21.88, 21, 20.13, true),
  (25, 'buchanans 12 YEARS 750', 'PRO-814448', '50196388', 'Whisky', 'VINOS - Principal', 24, 10, 'Botella', 1, 600, 576, 552, true),
  (26, 'buchanans 18 YEARS 750ml', 'PRO-932749', '5000196001695', 'Whisky', 'VINOS - Principal', 12, 6, 'Botella', 1, 1237.5, 1188, 1138.5, true),
  (27, 'buchanans MASTER 750ml', 'PRO-590956', '5000196003774', 'Whisky', 'VINOS - Principal', 12, 6, 'Botella', 1, 806.25, 774, 741.75, true),
  (28, 'buchanans PINEAPPLE 750ml', 'PRO-067804', '5000196007246', 'Whisky', 'VINOS - Principal', 24, 10, 'Botella', 1, 775, 744, 713, true),
  (29, 'buchanans RED SEAL 750 ml', 'PRO-068621', '5000196003248', 'Whisky', 'VINOS - Principal', 1, 1, 'Botella', 1, 4312.5, 4140, 3967.5, true),
  (30, 'BuzzBallz Chili Mango 200ml', 'PRO-939043', '857674007855', 'Premezcladas', 'VINOS - Principal', 456, 10, 'Pieza', 1, 73.75, 70.8, 67.85, true),
  (31, 'BuzzBallZ Forbidden Apple 200ml', 'PRO-096521', '857641002234', 'Jugos', 'VINOS - Principal', 144, 10, 'Pieza', 1, 73.75, 70.8, 67.85, true),
  (32, 'BuzzBallz Strawberry Rita 200 ml', 'PRO-384529', '857641002609', 'Jugos', 'VINOS - Principal', 360, 360, 'Pieza', 1, 73.75, 70.8, 67.85, true),
  (33, 'Captain Morgan 700ml', 'PRO-370866', '5000281055374', 'Ron', 'VINOS - Principal', 22, 10, 'Botella', 1, 187.5, 180, 172, true),
  (34, 'caribe DURAZNO 300ml', 'PRO-759286', '7501032485016', 'Premezcladas', 'VINOS - Principal', 60, 10, 'Pieza', 1, 24.8, 23.81, 22.82, true),
  (35, 'caribe FRESA 300ml', 'PRO-597747', '7501032485047', 'Premezcladas', 'VINOS - Principal', 60, 10, 'Pieza', 1, 24.8, 23.81, 22.82, true),
  (36, 'caribe MANDARINA 300ml', 'PRO-949677', '7501032485078', 'Premezcladas', 'VINOS - Principal', 60, 10, 'Pieza', 1, 24.8, 23.81, 22.82, true),
  (37, 'caribe MANGO PINA 300ml', 'PRO-210083', '7501032485030', 'Premezcladas', 'VINOS - Principal', 60, 10, 'Pieza', 1, 24.8, 23.81, 22.82, true),
  (38, 'caribe MANZANA KIWI 300ml', 'PRO-809280', '7501032485054', 'Premezcladas', 'VINOS - Principal', 60, 10, 'Pieza', 1, 24.8, 23.81, 22.82, true),
  (39, 'caribe TINTO 300ml', 'PRO-553078', '7501032485023', 'Premezcladas', 'VINOS - Principal', 60, 10, 'Pieza', 1, 24.8, 23.81, 22.82, true),
  (40, 'centenario AÑEJO 695ml', 'PRO-169160', '7501048810406', 'Tequila', 'VINOS - Principal', 24, 10, 'Botella', 1, 634.97, 609.57, 584.17, true),
  (41, 'centenario PLATA 950', 'PRO-790135', '7501048810116', 'Tequila', 'VINOS - Principal', 24, 10, 'Botella', 1, 353.75, 339.6, 325.45, true),
  (42, 'Centinela Clasico blanco 1L', 'PRO-735924', '749787100069', 'Tequila', 'VINOS - Principal', 24, 12, 'Botella', 1, 300, 288, 276, true),
  (43, 'centinela ETERNO CRISTALINO 750ml', 'PRO-701831', '749787093057', 'Tequila', 'VINOS - Principal', 24, 10, 'Botella', 1, 743.75, 714, 684.25, true),
  (44, 'clamato ORIGINAL 1.89ml', 'PRO-501563', '014800515343', 'Jugos', 'VINOS - Principal', 40, 10, 'Pieza', 1, 69.38, 68.24, 65.4, true),
  (45, 'clamato ORIGINAL 2.54l', 'PRO-622406', '014800001655', 'Jugos', 'VINOS - Principal', 40, 0, 'Pieza', 1, 94.21, 90.44, 86.68, true),
  (46, 'clamato ORIGINAL 296ml', 'PRO-311695', '014800515312', 'Jugos', 'VINOS - Principal', 120, 10, 'Pieza', 1, 20.62, 19.8, 18.98, true),
  (47, 'clamato ORIGINAL 473ml', 'PRO-073553', '014800515329', 'Jugos', 'VINOS - Principal', 60, 10, 'Pieza', 1, 29.78, 28.5, 27.31, true),
  (48, 'clamato ORIGINAL 945ml', 'PRO-191933', '014800515336', 'Jugos', 'VINOS - Principal', 48, 10, 'Pieza', 1, 49.27, 47.29, 45.32, true),
  (49, 'clase azul PLATA', 'PRO-532676', '850014275105', 'COLECCION', 'VINOS - Principal', 1, 1, 'Botella', 1, 2487.5, 2388, 2288.5, true),
  (50, 'clase azul REPOSADO 750ml', 'PRO-654446', '850014275099', 'COLECCION', 'VINOS - Principal', 1, 1, 'Botella', 1, 3375, 3240, 3105, true),
  (51, 'clase azul ULTRA 750 ml', 'PRO-178832', '081240049905', 'COLECCION', 'VINOS - Principal', 1, 1, 'Botella', 1, 40, 38400, 36800, true),
  (52, 'Cognac Hennessy V.S.O.P 700ml', 'PRO-415158', '3245999484319', null, 'VINOS - Principal', 12, 12, 'Botella', 1, 1118.75, 1074, 1029, true),
  (53, 'Cognac Martell VSOP 700 ml', 'PRO-613712', '080432112823', null, 'VINOS - Principal', 12, 24, 'Botella', 1, 931.25, 894, 856, true),
  (54, 'Concha y toro CABERNET SUAVIGNON 750ml', 'PRO-750980', '7804320637006', 'Vino', 'VINOS - Principal', 6, 3, 'Botella', 1, 135, 129.6, 124.2, true),
  (55, 'Concha y toro Carmenere 750ml', 'PRO-620661', '7804320116921', 'Vino', 'VINOS - Principal', 6, 3, 'Botella', 1, 135, 129.6, 124.2, true),
  (56, 'Concha y toro MALBEC 750ml', 'PRO-505160', '7798039590496', 'Vino', 'VINOS - Principal', 6, 3, 'Botella', 1, 135, 129.6, 124.2, true),
  (57, 'Concha y toro MERLOT 750ml', 'PRO-616119', '7804320148397', 'Vino', 'VINOS - Principal', 6, 3, 'Botella', 1, 135, 129.6, 124.2, true),
  (58, 'Corona Extra Ambarmedia 355ml', 'PRO-837194', '7501064101465', 'Cerveza', 'VINOS - Principal', 0, 24, 'Pieza', 1, 12.95, 0, 0, true),
  (59, 'Corona Extra Familiar 940ml', 'PRO-901187', '7501064113024', 'Cerveza', 'VINOS - Principal', 0, 24, 'Pieza', 1, 33.16, 0, 0, true),
  (60, 'Corona Extra Mega 1.2L', 'PRO-124648', '7501064101205', 'Cerveza', 'VINOS - Principal', 0, 24, 'Pieza', 1, 38.91, 0, 0, true),
  (61, 'Corona Light bote 355ml', 'PRO-632163', '7501064107153', 'Cerveza', 'VINOS - Principal', 0, 24, 'Pieza', 1, 14.83, 0, 0, true),
  (62, 'Coronita Extra 210ml', 'PRO-478125', '7501064103100', 'Cerveza', 'VINOS - Principal', 0, 24, 'Pieza', 1, 9.4, 0, 0, true),
  (63, 'Coronita Extra Ambar 210ml', 'PRO-563761', '75034627', 'Cerveza', 'VINOS - Principal', 0, 24, 'Pieza', 1, 9.4, 0, 0, true),
  (64, 'dom perignon 750ml', 'PRO-487134', '3185370365007', 'COLECCION', 'VINOS - Principal', 1, 1, 'Botella', 1, 6250, 6000, 5750, true),
  (65, 'don julio 1942', 'PRO-544794', '7506064300344', 'COLECCION', 'VINOS - Principal', 1, 1, 'Botella', 1, 3312.5, 3180, 3047.5, true),
  (66, 'don julio 1942 FIFA 750ml', 'PRO-424424', '088076191013', 'COLECCION', 'VINOS - Principal', 1, 1, 'Botella', 1, 4750, 4560, 4370, true),
  (67, 'don julio 1942 ULTIMA RESERVA 750ml', 'PRO-501950', 'don julio 1942 ULTIMA RESERVA 750ml', 'COLECCION', 'VINOS - Principal', 1, 1, 'Botella', 1, 13750, 13200, 12650, true),
  (68, 'Don Julio 70 700ml', 'PRO-544354', '5000281056265', 'Tequila', 'VINOS - Principal', 24, 10, 'Botella', 1, 822.5, 789.6, 756.7, true),
  (69, 'don julio 70 EDICION MUNDIAL 700ml', 'PRO-354198', '5000281082530', 'COLECCION', 'VINOS - Principal', 1, 1, 'Botella', 1, 1037.5, 996, 954.5, true),
  (70, 'don julio BLANCO 700ml', 'PRO-662739', '5000281056272', 'Tequila', 'VINOS - Principal', 24, 10, 'Botella', 1, 525, 504, 483, true),
  (71, 'Electrolit  COCO 625 ml', 'PRO-415168', '7501125104411', 'Jugos', 'VINOS - Principal', 36, 10, 'Pieza', 1, 24.79, 23.8, 22.8, true),
  (72, 'Electrolit FRESA KIWI 625 ml', 'PRO-600307', '7501125149221', 'Jugos', 'VINOS - Principal', 36, 10, 'Pieza', 1, 24.79, 23.8, 22.8, true),
  (73, 'Electrolit LIMA LIMON 625 ml', 'PRO-744421', '7501125118562', 'Jugos', 'VINOS - Principal', 48, 10, 'Pieza', 1, 24.79, 23.8, 22.8, true),
  (74, 'Electrolit MORA AZUL 625ml', 'PRO-303769', '7501125174797', 'Jugos', 'VINOS - Principal', 36, 0, 'Pieza', 1, 24.79, 23.8, 22.8, true),
  (75, 'Electrolit UVA 625ml', 'PRO-452119', '7501125144851', 'Jugos', 'VINOS - Principal', 24, 10, 'Pieza', 1, 24.79, 23.8, 22.8, true),
  (76, 'flamingo CURACAO 1L', 'PRO-777165', '7501043709354', 'licor', 'VINOS - Principal', 3, 1, 'Botella', 1, 150, 144, 138, true),
  (77, 'Flamingo licor de cereza 1L', 'PRO-086211', '7501043707251', 'licor', 'VINOS - Principal', 2, 1, 'Botella', 1, 150, 144, 138, true),
  (78, 'Flamingo licor de fruta de la pasion 1L', 'PRO-928812', '7501043720021', 'licor', 'VINOS - Principal', 2, 1, 'Botella', 1, 150, 144, 138, true),
  (79, 'Flamingo licor de Platano 1L', 'PRO-894197', '7501043708654', null, 'VINOS - Principal', 2, 3, 'Botella', 1, 150, 144, 138, true),
  (80, 'flamingo TRIPLE SEC 1L', 'PRO-646509', '7501043709255', 'licor', 'VINOS - Principal', 4, 1, 'Botella', 1, 150, 144, 138, true),
  (81, 'Grey Goose 700ml', 'PRO-193286', '5010677850100', 'Vodka', 'VINOS - Principal', 24, 10, 'Botella', 1, 593.75, 570, 546.25, true),
  (82, 'hennesy X.O othoniel', 'PRO-956199', '3245990624011', 'COLECCION', 'VINOS - Principal', 1, 1, 'Botella', 1, 6250, 6000, 5750, true),
  (83, 'herradura AÑEJO ULTRA 700ml', 'PRO-443266', '744607007900', 'Tequila', 'VINOS - Principal', 24, 10, 'Botella', 1, 747.5, 717.6, 687.15, true),
  (84, 'Herradura Plata 950 ml', 'PRO-673999', '744607008051', 'Tequila', 'VINOS - Principal', 0, 12, 'Botella', 1, 685, 657.6, 630.2, true),
  (85, 'herradura SELECCION SUPREMA 750ml', 'PRO-794898', '744607005203', 'COLECCION', 'VINOS - Principal', 1, 1, 'Botella', 1, 3750, 3600, 3450, true),
  (86, 'Jack Daniels 700ml', 'PRO-950975', '082184090473', 'Whisky', 'VINOS - Principal', 24, 10, 'Botella', 1, 468.75, 450, 431.25, true),
  (87, 'jagermeister 700ml', 'PRO-288060', '4067700014047', 'licor', 'VINOS - Principal', 24, 0, 'Botella', 1, 450, 432, 414, true),
  (88, 'joya DIAMANTE añejo cristalino', 'PRO-844807', '7503007820105', 'COLECCION', 'VINOS - Principal', 1, 1, 'Botella', 1, 975, 936, 897, true),
  (89, 'jugo Maggi 800 ml', 'PRO-110534', '7501001604004', null, 'VINOS - Principal', 0, 6, 'Pieza', 1, 241.56, 237.6, 227.7, true),
  (90, 'jugo sazonador MAGGI 800ml', 'PRO-011172', '7501001604004', 'salsas', 'VINOS - Principal', 6, 0, 'Pieza', 1, 241.56, 237.6, 227.7, true),
  (91, 'Jumex Arandano 1L', 'PRO-235240', '7501013106893', null, 'VINOS - Principal', 60, 10, 'Pieza', 1, 40.41, 38.8, 37.18, true),
  (92, 'Jumex arandano tetra 475 ml', 'PRO-621155', '7501013104455', 'Jugos', 'VINOS - Principal', 60, 10, 'Pieza', 1, 23.38, 22.99, 22.03, true),
  (93, 'jumex bida FRESA 237ml', 'PRO-331945', '7501013106824', 'Jugos', 'VINOS - Principal', 24, 10, 'Pieza', 1, 9.11, 8.75, 8.38, true),
  (94, 'jumex bida FRESA 500ml', 'PRO-872910', '7501013191219', 'Jugos', 'VINOS - Principal', 12, 10, 'Pieza', 1, 15.31, 14.7, 14.09, true),
  (95, 'jumex bida GUAYABA 237ml', 'PRO-011468', '7501013106800', 'Jugos', 'VINOS - Principal', 24, 0, 'Pieza', 1, 9.11, 8.75, 8.38, true),
  (96, 'jumex bida GUAYABA 500ml', 'PRO-772607', '7501013191066', 'Jugos', 'VINOS - Principal', 12, 10, 'Pieza', 1, 15.31, 14.7, 14.09, true),
  (97, 'jumex bida MANGO 500ml', 'PRO-972715', '7501013191035', 'Jugos', 'VINOS - Principal', 12, 10, 'Pieza', 1, 15.31, 14.7, 14.09, true),
  (98, 'jumex bida MANZANA 237ml', 'PRO-571696', '7501013106831', 'Jugos', 'VINOS - Principal', 48, 10, 'Pieza', 1, 9.11, 8.75, 8.38, true),
  (99, 'jumex bida MANZANA 500ml', 'PRO-126761', '7501013191028', 'Jugos', 'VINOS - Principal', 24, 10, 'Pieza', 1, 15.31, 14.7, 14.09, true),
  (100, 'Jumex Botellon Durazno 413 ml', 'PRO-161513', '7501013105537', 'Jugos', 'VINOS - Principal', 96, 10, 'Pieza', 1, 17.5, 16.8, 16.1, true);

-- Fuente limpia y match contra productos existentes.
create temp table _vinos_productos_match on commit drop as
with src as (
  select
    row_no,
    nullif(trim(nombre), '') as nombre,
    nullif(trim(codigo_sku), '') as codigo_sku,
    nullif(trim(codigo_barras), '') as codigo_barras,
    case when lower(nullif(trim(categoria), '')) = 'null' then null else nullif(trim(categoria), '') end as categoria,
    nullif(trim(sucursal), '') as sucursal,
    stock_sucursal,
    stock_minimo,
    nullif(trim(unidad_medida), '') as unidad_medida,
    coalesce(factor_to_base, 1) as factor_to_base,
    precio_menudeo,
    precio_medio_mayoreo,
    precio_mayoreo,
    coalesce(activo, true) as activo
  from _vinos_productos_csv
), matched as (
  select
    src.*,
    p_match.id as product_id,
    p_match.match_type,
    c.id as category_id,
    u.id as uom_id,
    b.id as branch_id
  from src
  left join lateral (
    select
      p.id,
      case
        when src.codigo_sku is not null and lower(p.sku) = lower(src.codigo_sku) then 'sku'
        when src.codigo_barras is not null and p.barcode = src.codigo_barras then 'barcode'
        when src.nombre is not null and lower(trim(p.name)) = lower(trim(src.nombre)) then 'nombre'
        else 'sin_match'
      end as match_type
    from products p
    where p.deleted_at is null
      and (
        (src.codigo_sku is not null and lower(p.sku) = lower(src.codigo_sku))
        or (src.codigo_barras is not null and p.barcode = src.codigo_barras)
        or (src.nombre is not null and lower(trim(p.name)) = lower(trim(src.nombre)))
      )
    order by
      case
        when src.codigo_sku is not null and lower(p.sku) = lower(src.codigo_sku) then 1
        when src.codigo_barras is not null and p.barcode = src.codigo_barras then 2
        when src.nombre is not null and lower(trim(p.name)) = lower(trim(src.nombre)) then 3
        else 9
      end,
      p.created_at asc
    limit 1
  ) p_match on true
  left join categories c on src.categoria is not null and lower(trim(c.name)) = lower(trim(src.categoria))
  left join uoms u on src.unidad_medida is not null and lower(trim(u.name)) = lower(trim(src.unidad_medida))
  left join branches b on src.sucursal is not null and lower(trim(b.name)) = lower(trim(src.sucursal))
)
select * from matched;

-- Resumen previo: productos no encontrados o referencias inexistentes.
select
  'resumen previo' as tipo,
  count(*) as filas_csv,
  count(product_id) as productos_encontrados,
  count(*) filter (where product_id is null) as productos_sin_match,
  count(*) filter (where categoria is not null and category_id is null) as categorias_sin_match,
  count(*) filter (where unidad_medida is not null and uom_id is null) as unidades_sin_match,
  count(*) filter (where sucursal is not null and branch_id is null) as sucursales_sin_match
from _vinos_productos_match;

select
  row_no,
  nombre,
  codigo_sku,
  codigo_barras,
  categoria,
  unidad_medida,
  sucursal
from _vinos_productos_match
where product_id is null
   or (categoria is not null and category_id is null)
   or (unidad_medida is not null and uom_id is null)
   or (sucursal is not null and branch_id is null)
order by row_no;

-- 1) Actualiza datos principales del producto existente.
update products p
set
  name = m.nombre,
  sku = m.codigo_sku,
  barcode = m.codigo_barras,
  category_id = m.category_id,
  uom_id = coalesce(m.uom_id, p.uom_id),
  min_stock = coalesce(m.stock_minimo, p.min_stock),
  price_retail = coalesce(m.precio_menudeo, p.price_retail),
  price_mid_wholesale = coalesce(m.precio_medio_mayoreo, p.price_mid_wholesale),
  price_wholesale = coalesce(m.precio_mayoreo, p.price_wholesale),
  is_active = m.activo
from _vinos_productos_match m
where p.id = m.product_id;

-- 2) Actualiza stock existente para la sucursal encontrada. No crea filas si no existe product_stocks.
update product_stocks ps
set qty = coalesce(m.stock_sucursal, ps.qty)
from _vinos_productos_match m
where ps.product_id = m.product_id
  and ps.branch_id = m.branch_id;

-- 3) Actualiza unidad/precios existentes. No crea filas si no existe product_uoms.
-- Como el CSV tiene una unidad por producto, se actualiza la fila del mismo factor; si no existe, la primera fila del producto.
with target_product_uoms as (
  select distinct on (m.product_id)
    pu.id as product_uom_id,
    m.*
  from _vinos_productos_match m
  join product_uoms pu on pu.product_id = m.product_id
  where m.product_id is not null
  order by
    m.product_id,
    case when pu.factor_to_base = m.factor_to_base then 0 else 1 end,
    pu.factor_to_base asc,
    pu.id asc
)
update product_uoms pu
set
  uom_id = coalesce(t.uom_id, pu.uom_id),
  factor_to_base = coalesce(t.factor_to_base, pu.factor_to_base),
  price_retail = coalesce(t.precio_menudeo, pu.price_retail),
  price_mid_wholesale = coalesce(t.precio_medio_mayoreo, pu.price_mid_wholesale),
  price_wholesale = coalesce(t.precio_mayoreo, pu.price_wholesale)
from target_product_uoms t
where pu.id = t.product_uom_id;

-- Resumen posterior.
select
  'resumen posterior' as tipo,
  count(*) as filas_csv,
  count(product_id) as productos_actualizados_posibles,
  count(*) filter (where match_type = 'sku') as match_por_sku,
  count(*) filter (where match_type = 'barcode') as match_por_codigo_barras,
  count(*) filter (where match_type = 'nombre') as match_por_nombre,
  count(*) filter (where product_id is null) as sin_match
from _vinos_productos_match;

commit;
