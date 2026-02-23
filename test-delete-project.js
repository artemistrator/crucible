// Тестовый скрипт для проверки удаления проекта
// Запуск: node test-delete-project.js

const PROJECT_ID = process.argv[2];

if (!PROJECT_ID) {
  console.error('Использование: node test-delete-project.js <PROJECT_ID>');
  console.error('Получите PROJECT_ID из URL страницы проекта');
  process.exit(1);
}

async function testDeleteProject() {
  try {
    console.log(`🗑️  Попытка удалить проект: ${PROJECT_ID}`);

    const response = await fetch(`http://localhost:3002/api/projects/${PROJECT_ID}`, {
      method: 'DELETE',
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`❌ Ошибка HTTP ${response.status}:`, data);
      process.exit(1);
    }

    console.log('✅ Проект успешно удален!');
    console.log('📊 Извлечённые инсайты:', data.learnedInsights);

  } catch (error) {
    console.error('❌ Ошибка при удалении:', error.message);
    process.exit(1);
  }
}

testDeleteProject();
