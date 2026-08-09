// Windows 发布构建时不弹出控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    xiaoxin_toolbox_lib::run()
}
