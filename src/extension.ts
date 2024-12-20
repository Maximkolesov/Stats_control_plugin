import * as vscode from 'vscode';

interface file_stats
{
    file_name: string;
    language_id: string;
    total_time_ms: number;
    chars_added: number;
    chars_deleted: number;
    lines_added: number;
    lines_deleted: number;
    saves_count: number;
    last_active_timestamp: number | null;
}

export function activate(context: vscode.ExtensionContext)
{
    const file_stats_map: Map<string, file_stats> = new Map();
    let current_active_editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    let session_start = Date.now();

    vscode.workspace.textDocuments.forEach(doc =>
    {
        if (!doc.isUntitled)
        {
            init_file_stats(doc);
        }
    });

    const open_listener = vscode.workspace.onDidOpenTextDocument(doc =>
    {
        if (!doc.isUntitled)
        {
            init_file_stats(doc);
        }
    });

    const close_listener = vscode.workspace.onDidCloseTextDocument(doc =>
    {
    });

    const change_active_editor_listener = vscode.window.onDidChangeActiveTextEditor(editor =>
    {
        const now = Date.now();
        if (current_active_editor && current_active_editor.document && !current_active_editor.document.isUntitled)
        {
            update_time_for_doc(current_active_editor.document.uri.toString(), now);
        }
        current_active_editor = editor;
        if (editor && !editor.document.isUntitled)
        {
            const stats = file_stats_map.get(editor.document.uri.toString());
            if (stats)
            {
                stats.last_active_timestamp = now;
            }
        }
    });

    const change_text_listener = vscode.workspace.onDidChangeTextDocument(event =>
    {
        if (event.document.isUntitled)
        {
            return;
        }
        const doc_key = event.document.uri.toString();
        const stats = file_stats_map.get(doc_key);
        if (!stats)
        {
            return;
        }
        event.contentChanges.forEach(change =>
        {
            const text_added = change.text.length;
            const text_removed = change.rangeLength;
            const added_lines = change.text.split(/\r\n|\r|\n/).length - 1;
            const removed_lines = change.range.end.line - change.range.start.line;
            stats.chars_added += text_added;
            stats.chars_deleted += text_removed;
            stats.lines_added += Math.max(0, added_lines);
            stats.lines_deleted += Math.max(0, removed_lines);
        });
    });

    const save_listener = vscode.workspace.onDidSaveTextDocument(doc =>
    {
        if (doc.isUntitled)
        {
            return;
        }
        const stats = file_stats_map.get(doc.uri.toString());
        if (stats)
        {
            stats.saves_count += 1;
        }
    });

    const show_stats_command = vscode.commands.registerCommand('stats_control.show_stats', () =>
    {
        const now = Date.now();
        if (current_active_editor && current_active_editor.document && !current_active_editor.document.isUntitled)
        {
            update_time_for_doc(current_active_editor.document.uri.toString(), now);
        }

        const lang_map: { [lang: string]: { total_time_ms: number; chars_added: number; chars_deleted: number } } = {};
        let overall_time = 0;

        for (const stats of file_stats_map.values())
        {
            overall_time += stats.total_time_ms;
            if (!lang_map[stats.language_id])
            {
                lang_map[stats.language_id] = {
                    total_time_ms: 0,
                    chars_added: 0,
                    chars_deleted: 0
                };
            }
            lang_map[stats.language_id].total_time_ms += stats.total_time_ms;
            lang_map[stats.language_id].chars_added += stats.chars_added;
            lang_map[stats.language_id].chars_deleted += stats.chars_deleted;
        }

        let report = `Отчет работы расширения Stats Control\n`;
        report += `Общее время работы: ${format_time(overall_time)}\n\n`;
        report += `=== Статистика работы по языкам:\n`;
        for (const lang in lang_map)
        {
            report += `Язык программирования: ${lang}\n`;
            report += `  Время работы: ${format_time(lang_map[lang].total_time_ms)}\n`;
            report += `  Символов добавлено: ${lang_map[lang].chars_added}\n`;
            report += `  Символов удалено: ${lang_map[lang].chars_deleted}\n\n`;
        }

        report += `=== Статистика работы по файлам:\n`;
        for (const stats of file_stats_map.values())
        {
            report += `Файл: ${stats.file_name}\n`;
            report += `  Язык программирования: ${stats.language_id}\n`;
            report += `  Время работы: ${format_time(stats.total_time_ms)}\n`;
            report += `  Добавлено символов: ${stats.chars_added}\n`;
            report += `  Удалено символов: ${stats.chars_deleted}\n`;
            report += `  Добавлено строк: ${stats.lines_added}\n`;
            report += `  Удалено строк: ${stats.lines_deleted}\n`;
            report += `  Количество сохранений: ${stats.saves_count}\n`;
            report += `\n`;
        }

        vscode.window.showInformationMessage("Статистика сгенерирована. Откройте 'Output (Stats Control)' для просмотра.");
        const output_channel = vscode.window.createOutputChannel("Stats Control");
        output_channel.clear();
        output_channel.appendLine(report);
        output_channel.show();
    });

    context.subscriptions.push(open_listener, close_listener, change_active_editor_listener, change_text_listener, save_listener, show_stats_command);

    function init_file_stats(doc: vscode.TextDocument)
    {
        const key = doc.uri.toString();
        if (!file_stats_map.has(key))
        {
            file_stats_map.set(key, {
                file_name: doc.fileName,
                language_id: doc.languageId,
                total_time_ms: 0,
                chars_added: 0,
                chars_deleted: 0,
                lines_added: 0,
                lines_deleted: 0,
                saves_count: 0,
                last_active_timestamp: (current_active_editor && current_active_editor.document.uri.toString() === key) ? Date.now() : null
            });
        }
    }

    function update_time_for_doc(uri: string, now: number)
    {
        const stats = file_stats_map.get(uri);
        if (stats && stats.last_active_timestamp !== null)
        {
            stats.total_time_ms += (now - stats.last_active_timestamp);
            stats.last_active_timestamp = now;
        }
    }

    function format_time(ms: number): string
    {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const s = seconds % 60;
        const m = minutes % 60;
        const h = hours;
        return `${h}часы ${m}минуты ${s}секунды`;
    }
}


