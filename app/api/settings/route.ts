import { NextResponse } from "next/server";
import { getPublicSettings, updateSettings, type SettingsUpdate } from "@/lib/settings";

export async function GET() {
  try {
    const settings = await getPublicSettings();
    return NextResponse.json(settings);
  } catch (e) {
    console.error("[settings] GET failed:", e);
    return NextResponse.json(
      { error: "Failed to load settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const update: SettingsUpdate = {};
    if (typeof body.defaultMaxTokens === "number") update.defaultMaxTokens = body.defaultMaxTokens;
    if (typeof body.defaultTemperature === "number") update.defaultTemperature = body.defaultTemperature;
    if (typeof body.defaultAiProvider === "string") update.defaultAiProvider = body.defaultAiProvider;
    if (typeof body.defaultAiModel === "string") update.defaultAiModel = body.defaultAiModel;

    await updateSettings(update);
    const settings = await getPublicSettings();
    return NextResponse.json(settings);
  } catch (e) {
    console.error("[settings] POST failed:", e);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 }
    );
  }
}
