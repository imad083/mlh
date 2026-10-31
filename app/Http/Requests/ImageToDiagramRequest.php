<?php

namespace App\Http\Requests;

use App\Services\AI\DiagramContractValidator;
use Illuminate\Foundation\Http\FormRequest;

final class ImageToDiagramRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'image' => ['required', 'file', 'mimes:png,jpg,jpeg', 'max:10240'],
            'mode' => ['required', 'string', 'in:recreate,reconstruct'],
            'diagramType' => ['required', 'string', 'in:'.implode(',', DiagramContractValidator::DIAGRAM_TYPES)],
        ];
    }
}
