// DOM Elements
const searchInput = document.getElementById('city-search');
const searchBtn = document.getElementById('search-btn');
const weatherDisplay = document.getElementById('weather-display');
const errorMessage = document.getElementById('error-message');

// 1. Geocoding Function
async function getCoordinates(city) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${city}&count=1&language=ru&format=json`;
    const response = await fetch(url);
    
    if (!response.ok) {
        throw new Error('Ошибка сети при поиске города');
    }
    
    const data = await response.json();
    
    if (!data.results || data.results.length === 0) {
        throw new Error('Город не найден');
    }
    
    const { latitude, longitude, name, country } = data.results[0];
    return { latitude, longitude, name, country };
}

// 2. Weather Function
async function getWeather(lat, lon) {
    // Запрашиваем current_weather + влажность (humidity доступна в hourly, берем текущий час)
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=relativehumidity_2m`;
    const response = await fetch(url);
    
    if (!response.ok) {
        throw new Error('Ошибка сети при получении погоды');
    }
    
    const data = await response.json();
    
    return {
        temp: data.current_weather.temperature,
        wind: data.current_weather.windspeed,
        humidity: data.hourly.relativehumidity_2m[0] // Упрощение для текущего часа
    };
}

// 3. UI Update & Handler
async function updateWeatherUI() {
    const city = searchInput.value.trim();
    if (!city) {
        errorMessage.textContent = 'Пожалуйста, введите название города';
        errorMessage.style.display = 'block';
        return;
    }

    // Индикатор загрузки
    searchBtn.textContent = 'Загрузка...';
    searchBtn.disabled = true;
    errorMessage.style.display = 'none';
    weatherDisplay.classList.remove('visible');

    try {
        // 1. Получаем координаты
        const location = await getCoordinates(city);
        
        // 2. Получаем погоду
        const weather = await getWeather(location.latitude, location.longitude);
        
        // 3. Обновляем DOM
        const cityNameEl = document.querySelector('.city-name');
        const tempEl = document.querySelector('.temperature');
        const windEl = document.querySelector('.wind');
        const humidityEl = document.querySelector('.humidity');

        if (cityNameEl) cityNameEl.textContent = `${location.name}, ${location.country}`;
        if (tempEl) tempEl.textContent = `${Math.round(weather.temp)}°C`;
        if (windEl) windEl.textContent = `${weather.wind} км/ч`;
        if (humidityEl) humidityEl.textContent = `${weather.humidity}%`;
        
        // Показываем блок с анимацией
        weatherDisplay.classList.add('visible');
        
    } catch (error) {
        console.error(error);
        errorMessage.textContent = error.message;
        errorMessage.style.display = 'block';
        weatherDisplay.classList.remove('visible');
    } finally {
        // Возвращаем кнопку в исходное состояние
        searchBtn.textContent = 'Поиск';
        searchBtn.disabled = false;
    }
}

// Event Listeners
if (searchBtn) {
    searchBtn.addEventListener('click', updateWeatherUI);
}

if (searchInput) {
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') updateWeatherUI();
    });
}
