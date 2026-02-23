// Тестовый скрипт для проверки релевантности планов
// Запуск: node test-relevance.js

const TEST_IDEA = "Простой блог на Next.js с Markdown";

async function testRelevance() {
  try {
    console.log(`📝 Тестирую идею: "${TEST_IDEA}"`);

    const response = await fetch('http://localhost:3002/api/decompose-idea', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ideaText: TEST_IDEA }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`❌ Ошибка HTTP ${response.status}:`, data);
      process.exit(1);
    }

    console.log('✅ Проект создан!');
    console.log(`📦 Project ID: ${data.projectId}`);
    console.log('\n📊 Планы:');

    data.plans.forEach((plan, index) => {
      console.log(`\n${index + 1}. ${plan.title}`);
      console.log(`   Стек: ${plan.techStack}`);
      console.log(`   Релевантность: ${plan.relevanceScore}%`);
      console.log(`   ${plan.description?.substring(0, 100)}...`);
    });

    console.log('\n💡 Теперь проверьте страницу проекта в браузере:');
    console.log(`http://localhost:3002/project/${data.projectId}`);
    console.log('\nРелевантность должна быть нормализована до 100% шкалы.');

  } catch (error) {
    console.error('❌ Ошибка при тестировании:', error.message);
    process.exit(1);
  }
}

testRelevance();
