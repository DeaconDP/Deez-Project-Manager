#[cfg(test)]
mod smoke {
    #[test]
    fn enumerate_returns_topology() {
        let topo = crate::usb::enumerate().expect("enumerate should succeed on Windows");
        println!(
            "controllers={} devices={} warnings={}",
            topo.controllers.len(),
            topo.devices.len(),
            topo.warnings.len()
        );
        for w in &topo.warnings {
            println!("warn {} {}", w.code, w.message);
        }
        for c in &topo.controllers {
            println!(
                "controller {} mapped={} hubs={}",
                c.name,
                c.mapped,
                c.hubs.len()
            );
            for h in &c.hubs {
                println!(
                    "  hub {} ports={} empty={} children={}",
                    h.name,
                    h.port_count,
                    h.ports
                        .iter()
                        .filter(|p| p.status == crate::usb::model::PortStatus::Empty)
                        .count(),
                    h.child_hubs.len()
                );
                for child in &h.child_hubs {
                    println!(
                        "    child {} ports={} empty={}",
                        child.name,
                        child.port_count,
                        child
                            .ports
                            .iter()
                            .filter(|p| p.status == crate::usb::model::PortStatus::Empty)
                            .count()
                    );
                }
            }
        }
        assert!(
            !topo.controllers.is_empty() || !topo.warnings.is_empty(),
            "expected controllers or warnings"
        );
    }
}
