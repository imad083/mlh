<?php

namespace App\Http\Requests;

use App\Services\AI\DiagramContractValidator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

final class AIEditRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'prompt' => ['required', 'string', 'max:10000'],
            'diagramType' => ['required', 'string', 'in:'.implode(',', DiagramContractValidator::DIAGRAM_TYPES)],
            'scope' => ['required', 'string', 'in:selected,all'],
            'selectedElementIds' => ['nullable', 'array'],
            'selectedElementIds.*' => ['string', 'distinct'],
            'diagram' => ['required', 'array'],
            'diagram.elements' => ['present', 'array'],
            'diagram.connections' => ['present', 'array'],
            'diagram.elements.*.id' => ['required', 'string'],
            'diagram.elements.*.type' => ['required', 'string', 'in:'.implode(',', DiagramContractValidator::SHAPE_TYPES)],
            'diagram.elements.*.text' => ['required', 'string'],
            'diagram.elements.*.x' => ['required', 'numeric'],
            'diagram.elements.*.y' => ['required', 'numeric'],
            'diagram.elements.*.width' => ['required', 'numeric', 'gt:0'],
            'diagram.elements.*.height' => ['required', 'numeric', 'gt:0'],
            'diagram.elements.*.style' => ['sometimes', 'array'],
            'diagram.connections.*.id' => ['required', 'string'],
            'diagram.connections.*.from' => ['required', 'string'],
            'diagram.connections.*.to' => ['required', 'string'],
            'diagram.connections.*.label' => ['sometimes', 'string'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $data = $this->all();
            if (($data['scope'] ?? null) === 'selected' && empty($data['selectedElementIds'])) {
                $validator->errors()->add('selectedElementIds', 'Selected scope requires at least one element ID.');
            }

            if (isset($data['diagram']) && is_array($data['diagram'])) {
                foreach (app(DiagramContractValidator::class)->validateDiagram($data['diagram']) as $error) {
                    $validator->errors()->add('diagram', $error);
                }
            }

            $elementIds = collect($data['diagram']['elements'] ?? [])->pluck('id')->all();
            foreach ($data['selectedElementIds'] ?? [] as $id) {
                if (! in_array($id, $elementIds, true)) {
                    $validator->errors()->add('selectedElementIds', "Unknown selected element ID: {$id}.");
                }
            }
        });
    }
}
