pub mod gpu;
pub mod process;
pub mod system;
pub mod temps;

pub use gpu::GpuCollector;
pub use system::SystemCollector;
pub use temps::sample_temps;
