import chalk from "chalk";
import {Telegraf} from "telegraf";
import {WELCOME} from "./constant.ts";
import { registerHandlers } from "./handler.ts";
export async function runTelegramMode() {
    const token=process.env.TELEGRAM_BOT_TOKEN;
    const ownerId=process.env.TELEGRAM_OWNER_ID;
    const bot=new Telegraf(token||"");
    
    registerHandlers(bot);
    await bot.telegram.sendMessage(ownerId||"", WELCOME,{parse_mode:"Markdown"});
    console.log(chalk.bold.green("send welcome message to telegram bot owner"));
    bot.launch();
    console.log(chalk.bold.green("Telegram bot is running!,Press Ctrl+C to stop."));
    await new Promise<void>((resolve) => {
        const stop = () => {
            bot.stop("SIGINT");
            resolve();
        }
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);
    })

}