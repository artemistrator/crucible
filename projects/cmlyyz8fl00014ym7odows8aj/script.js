const searchBtn = document.querySelector('#search-btn');
const cityInput = document.querySelector('#city-input');
const weatherCard = document.querySelector('.weather-card');
const loader = document.querySelector('#loader');
const errorMsg = document.querySelector('#error-message');

// Elements to update
const cityNameEl = document.querySelector('#city-name');
const tempValueEl = document.querySelector('#temp-value');
const weatherDescEl = document.querySelector('#weather-desc');
const windSpeedEl = document.querySelector('#wind-speed');

// Helper function to show error
function showError(message) {
    errorMsg.textContent = message;
    errorMsg.classList.add('visible');
    loader.style.display = 'none';
    weatherCard.classList.remove('visible');
}

// Helper function to reset UI state before new request
function resetUI() {
    errorMsg.classList.remove('visible');
    weatherCard.classList.remove('visible');
    loader.style.display = 'none';
}

async function getWeather() {
    const city = cityInput.value.trim();

    if (!city) {
        showError('Пожалуйста, введите название города.');
        return;
    }

    // UI: Сброс и старт загрузки
    resetUI();
    loader.style.display = 'block';

    try {
        // Step 1: Geocoding API to get Latitude and Longitude from City Name
        // We use the Open-Meteo Geocoding API
        const geoResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=ru&format=json`);
        const geoData = await geoResponse.json();

        if (!geoData.results || geoData.results.length === 0) {
            throw new Error('Город не найден. Попробуйте еще раз.');
        }

        const { latitude, longitude, name, country } = geoData.results[0];

        // Step 2: Fetch Weather Data using coordinates
        const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`);
        
        if (!weatherResponse.ok) {
            throw new Error('Ошибка при получении данных о погоде.');
        }

        const weatherData = await weatherResponse.json();
        const current = weatherData.current_weather;

        // Update DOM with data
        cityNameEl.textContent = `${name}, ${country}`;
        tempValueEl.textContent = Math.round(current.temperature);
        windSpeedEl.textContent = `Ветер: ${current.windspeed} км/ч`;
        
        // Simple description based on WMO code
        const weatherCodes = {
            0: 'Ясно',
            1: 'Преимущественно ясно',
            2: 'Переменная облачность',
            3: 'Пасмурно',
            45: 'Туман',
            48: 'Туман с инеем',
            51: 'Морось',
            53: 'Морось',
            55: 'Сильная морось',
            61: 'Небольшой дождь',
            63: 'Дождь',
            65: 'Сильный дождь',
            71: 'Небольшой снег',
            73: 'Снег',
            75: 'Сильный снег',
            80: 'Ливень',
            95: 'Гроза'
        };
        weatherDescEl.textContent = weatherCodes[current.weathercode] || 'Неизвестно';

        // UI: Показываем результат
        loader.style.display = 'none';
        weatherCard.classList.add('visible');

    } catch (error) {
        // UI: Обработка ошибки
        showError(error.message || 'Произошла непредвиденная ошибка.');
    }
}

// Event Listeners
searchBtn.addEventListener('click', getWeather);

cityInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        getWeather();
    }
});