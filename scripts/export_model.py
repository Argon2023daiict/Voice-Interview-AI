#!/usr/bin/env python3
"""
Export and quantize a T5-small model to ONNX format for client-side inference.
Produces INT8 quantized models under 30MB total.

Usage:
    pip install transformers optimum onnx onnxruntime
    python scripts/export_model.py
"""

import os
import shutil
from pathlib import Path

def main():
    try:
        from optimum.exporters.onnx import main_export
        from optimum.onnxruntime import ORTQuantizer
        from optimum.onnxruntime.configuration import AutoQuantizationConfig
    except ImportError:
        print("Installing required packages...")
        os.system("pip install optimum[onnxruntime] transformers torch")
        from optimum.exporters.onnx import main_export
        from optimum.onnxruntime import ORTQuantizer
        from optimum.onnxruntime.configuration import AutoQuantizationConfig

    model_name = "t5-small"
    output_dir = Path("public/models/summarizer")
    temp_dir = Path("temp_onnx_export")

    print(f"[1/4] Exporting {model_name} to ONNX...")
    main_export(
        model_name,
        output=str(temp_dir),
        task="text2text-generation",
        opset=14,
    )

    print("[2/4] Quantizing encoder to INT8...")
    output_dir.mkdir(parents=True, exist_ok=True)

    encoder_quantizer = ORTQuantizer.from_pretrained(str(temp_dir), file_name="encoder_model.onnx")
    quantization_config = AutoQuantizationConfig.avx2(is_static=False)
    encoder_quantizer.quantize(
        save_dir=str(output_dir),
        quantization_config=quantization_config,
        file_suffix="quantized",
    )

    print("[3/4] Quantizing decoder to INT8...")
    decoder_quantizer = ORTQuantizer.from_pretrained(str(temp_dir), file_name="decoder_model.onnx")
    decoder_quantizer.quantize(
        save_dir=str(output_dir),
        quantization_config=quantization_config,
        file_suffix="quantized",
    )

    print("[4/4] Copying tokenizer...")
    tokenizer_src = temp_dir / "tokenizer.json"
    tokenizer_dst = Path("public/models/tokenizer.json")
    if tokenizer_src.exists():
        shutil.copy2(tokenizer_src, tokenizer_dst)
    else:
        # Export tokenizer manually
        from transformers import AutoTokenizer
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        tokenizer.save_pretrained(str(output_dir))
        if (output_dir / "tokenizer.json").exists():
            shutil.copy2(output_dir / "tokenizer.json", tokenizer_dst)

    # Cleanup
    shutil.rmtree(temp_dir, ignore_errors=True)

    # Report sizes
    total_size = 0
    for f in output_dir.glob("*.onnx"):
        size_mb = f.stat().st_size / (1024 * 1024)
        total_size += size_mb
        print(f"  {f.name}: {size_mb:.1f} MB")

    print(f"\n✅ Total model size: {total_size:.1f} MB")
    print(f"   Target: ≤30 MB — {'PASS ✓' if total_size <= 30 else 'OVER BUDGET ✗'}")
    print(f"   Output: {output_dir.absolute()}")


if __name__ == "__main__":
    main()