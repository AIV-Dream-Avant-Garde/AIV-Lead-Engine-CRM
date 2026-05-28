/* ── DATA: Business category keywords, by country ────────── */

const KEYWORDS = {
 'Colombia': {
  'Comida & Bebida':['Restaurante','Panadería','Cafetería','Bar','Heladería','Pizzería','Asadero','Comida rápida','Mariscos','Vegetariano','Desayunos','Sopas','Empanadas','Jugos y Smoothies'],
  'Salud & Bienestar':['Clínica','Médico general','Centro médico','Dentista','Farmacia','Gimnasio','Óptica','Fisioterapia','Medicina estética','Psicólogo','Nutricionista','Laboratorio clínico','Ortopédico','Pediatra','Dermatólogo','Veterinaria'],
  'Servicios Profesionales':['Abogado','Contador','Notaría','Inmobiliaria','Seguros','Arquitecto','Ingeniería','Agencia de viajes','Consultoría','Recursos humanos','Gestor de trámites','Agencia de publicidad','Asesoría tributaria'],
  'Comercio & Retail':['Supermercado','Ferretería','Papelería','Ropa','Calzado','Joyería','Electrónica','Mueblería','Decoración','Flores','Mascotas','Licores','Materiales construcción'],
  'Educación':['Colegio','Universidad','Academia','Guardería','Preescolar','Idiomas','Centro de formación','Clases de música','Clases de baile','Tutorías'],
  'Belleza & Estética':['Peluquería','Barbería','Salón de uñas','Spa','Centro de estética','Bronceado','Depilación','Maquillaje','Micropigmentación','Masajes'],
  'Entretenimiento':['Discoteca','Karaoke','Billar','Bolos','Parque infantil','Sala de eventos','Escape room','Cine','Parque temático','Karts'],
  'Hospedaje':['Hotel','Hostal','Motel','Apartahotel','Finca de eventos','Cabaña','Glamping','Albergue'],
  'Automotriz':['Taller mecánico','Lavadero de carros','Concesionario','Repuestos','Pintura y latonería','Montallantas','Lubricentro','Grúas'],
  'Construcción':['Constructora','Plomero','Electricista','Pintor','Remodelaciones','Vidriería','Cerrajería','Impermeabilización','Acabados'],
  'Hogar & Servicios':['Limpieza del hogar','Jardinería','Mudanzas','Lavandería','Carpintería','Pintura hogar','Plomería','Cerrajería hogar','Electrodomésticos'],
  'Tecnología':['Servicio técnico computadores','Celulares y accesorios','Cámaras de seguridad','Diseño gráfico','Desarrollo web','Impresión digital','Soporte técnico empresarial','Redes e internet','Software a medida','Seguridad informática','Domótica'],
 },
 'Estados Unidos': {
  'Food & Drink':['Restaurant','Bakery','Cafe','Coffee Shop','Bar','Ice Cream Shop','Pizzeria','Steakhouse','Fast Food','Seafood Restaurant','Vegetarian Restaurant','Brunch','Food Truck','Juice Bar'],
  'Health & Wellness':['Clinic','Doctor','Medical Center','Dentist','Pharmacy','Gym','Optometrist','Physical Therapy','Med Spa','Psychologist','Nutritionist','Medical Lab','Chiropractor','Pediatrician','Dermatologist','Veterinarian'],
  'Professional Services':['Lawyer','Accountant','Notary','Real Estate Agency','Insurance Agency','Architect','Engineering Firm','Travel Agency','Consulting','Staffing Agency','Tax Service','Advertising Agency','Bookkeeping'],
  'Retail & Commerce':['Supermarket','Hardware Store','Office Supplies','Clothing Store','Shoe Store','Jewelry Store','Electronics Store','Furniture Store','Home Decor','Florist','Pet Store','Liquor Store','Building Materials'],
  'Education':['School','University','Academy','Daycare','Preschool','Language School','Training Center','Music Lessons','Dance Studio','Tutoring'],
  'Beauty & Grooming':['Hair Salon','Barber Shop','Nail Salon','Spa','Beauty Salon','Tanning Salon','Waxing','Makeup Artist','Microblading','Massage'],
  'Entertainment':['Nightclub','Karaoke Bar','Billiards','Bowling Alley','Playground','Event Venue','Escape Room','Movie Theater','Theme Park','Go Karts'],
  'Lodging':['Hotel','Hostel','Motel','Apartment Hotel','Event Venue','Cabin Rental','Glamping','Inn'],
  'Automotive':['Auto Repair','Car Wash','Car Dealership','Auto Parts','Body Shop','Tire Shop','Oil Change','Towing Service'],
  'Construction':['Construction Company','Plumber','Electrician','Painter','Remodeling','Glass Repair','Locksmith','Waterproofing','Drywall'],
  'Home & Services':['House Cleaning','Landscaping','Moving Company','Laundromat','Carpentry','House Painting','Plumbing','Locksmith','Appliance Repair'],
  'Technology':['Computer Repair','Cell Phone Store','Security Cameras','Graphic Design','Web Development','Print Shop','IT Support','Internet Service','Custom Software','Cybersecurity','Home Automation'],
 },
};

// Default country used across selectors and the lead-country backfill migration.
const DEFAULT_COUNTRY = 'Colombia';

// ISO region codes passed to Google Places to bias scrape results by country.
const COUNTRY_REGION = {
  'Colombia':       'co',
  'Estados Unidos': 'us',
};
