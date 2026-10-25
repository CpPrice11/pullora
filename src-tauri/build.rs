fn main() {
    println!("cargo:rerun-if-changed=icons/icon.ico");
    tauri_build::build();
    // Tauri links Windows resources to binaries; GNU lib unit tests need the same manifest.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("gnu")
    {
        println!(
            "cargo:rustc-link-search=native={}",
            std::env::var("OUT_DIR").unwrap()
        );
    }
}
