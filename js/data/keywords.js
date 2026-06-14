/* ── DATA: Business category keywords, by country ────────── */

const KEYWORDS = {
 'United States': {
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
const DEFAULT_COUNTRY = 'United States';

// ISO region codes passed to Google Places to bias scrape results by country.
const COUNTRY_REGION = {
  'United States': 'us',
};
