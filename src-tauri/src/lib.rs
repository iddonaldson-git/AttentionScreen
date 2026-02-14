// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

use tauri::{Emitter, Manager};
use tauri::menu::{MenuBuilder, MenuItem, PredefinedMenuItem};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                use tauri::menu::{MenuBuilder, MenuItem, SubmenuBuilder, PredefinedMenuItem};
        
                let settings = MenuItem::with_id(
                    app,
                    "open_settings",
                    "Settings…",
                    true,
                    Some("CmdOrCtrl+,"),
                )?;
        
                // App submenu (macOS leftmost app menu)
                let app_submenu = SubmenuBuilder::new(app, app.package_info().name.clone())
                    .item(&settings)
                    .separator()
                    .item(&PredefinedMenuItem::services(app, None)?)
                    .separator()
                    .item(&PredefinedMenuItem::hide(app, None)?)
                    .item(&PredefinedMenuItem::hide_others(app, None)?)
                    .item(&PredefinedMenuItem::show_all(app, None)?)
                    .separator()
                    .item(&PredefinedMenuItem::quit(app, None)?)
                    .build()?;
        
                // Edit submenu (standard)
                let edit_submenu = SubmenuBuilder::new(app, "Edit")
                    .item(&PredefinedMenuItem::undo(app, None)?)
                    .item(&PredefinedMenuItem::redo(app, None)?)
                    .separator()
                    .item(&PredefinedMenuItem::cut(app, None)?)
                    .item(&PredefinedMenuItem::copy(app, None)?)
                    .item(&PredefinedMenuItem::paste(app, None)?)
                    .item(&PredefinedMenuItem::select_all(app, None)?)
                    .build()?;
        
                // Window submenu (standard)
                let window_submenu = SubmenuBuilder::new(app, "Window")
                    .item(&PredefinedMenuItem::minimize(app, None)?)
                    //.item(&PredefinedMenuItem::zoom(app, None)?)
                    .separator()
                    .item(&settings) // <- Settings… lives here now
                    .separator()
                    .item(&PredefinedMenuItem::close_window(app, None)?)
                    .build()?;
        
                // Build full menu bar
                let menu = MenuBuilder::new(app)
                    .item(&app_submenu)
                    .item(&edit_submenu)
                    .item(&window_submenu)
                    .build()?;
        
                app.set_menu(menu)?;
            }
        
            Ok(())
        })
        
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "open_settings" {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.emit("menu:open-settings", ());
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
