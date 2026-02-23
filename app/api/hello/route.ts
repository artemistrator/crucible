export async function GET() {
  const body = { message: "Hello from AI Orchestrator!" };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
