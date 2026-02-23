import https from 'https';

// Replace with your actual API key from OpenWeatherMap
const API_KEY = 'YOUR_API_KEY_HERE'; 

// Check if city argument is provided
const city = process.argv[2];

if (!city) {
  console.error('Usage: node index.js <city>');
  process.exit(1);
}

const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=metric`;

const req = https.get(url, (res) => {
  let data = '';

  // A chunk of data has been received.
  res.on('data', (chunk) => {
    data += chunk;
  });

  // The whole response has been received.
  res.on('end', () => {
    if (res.statusCode !== 200) {
      try {
        const errorData = JSON.parse(data);
        console.error(`Error: ${errorData.message || 'City not found'}`);
      } catch (e) {
        console.error(`Error: Failed to fetch weather data (Status Code: ${res.statusCode})`);
      }
      process.exit(1);
    }

    try {
      const weatherData = JSON.parse(data);
      const temp = weatherData.main.temp;
      const description = weatherData.weather[0].description;
      const cityName = weatherData.name;

      console.log(`Weather in ${cityName}: ${temp}°C, ${description}`);
    } catch (error) {
      console.error('Error: Failed to parse weather data');
    }
  });
});

req.on('error', (e) => {
  console.error(`Network Error: ${e.message}`);
});