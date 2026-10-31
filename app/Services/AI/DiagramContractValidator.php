<?php

namespace App\Services\AI;

use App\Exceptions\InvalidAiResponseException;

final class DiagramContractValidator
{
    public const DIAGRAM_TYPES = [
        'system_architecture',
        'flowchart',
        'uml_class',
        'database_erd',
        'sequence_diagram',
    ];

    public const SHAPE_TYPES = ['rectangle', 'ellipse', 'diamond', 'text'];

    public function validateDiagram(array $diagram): array
    {
        $errors = [];
        if (! array_key_exists('elements', $diagram) || ! is_array($diagram['elements'])) {
            return ['Diagram elements must be an array.'];
        }
        if (! array_key_exists('connections', $diagram) || ! is_array($diagram['connections'])) {
            return ['Diagram connections must be an array.'];
        }

        $elementIds = [];
        foreach ($diagram['elements'] as $index => $element) {
            if (! is_array($element)) {
                $errors[] = "Element {$index} must be an object.";

                continue;
            }
            $errors = [...$errors, ...$this->validateElement($element, "Element {$index}")];
            if (isset($element['id']) && is_string($element['id'])) {
                if (in_array($element['id'], $elementIds, true)) {
                    $errors[] = "Duplicate element ID: {$element['id']}.";
                }
                $elementIds[] = $element['id'];
            }
        }

        $connectionIds = [];
        foreach ($diagram['connections'] as $index => $connection) {
            if (! is_array($connection)) {
                $errors[] = "Connection {$index} must be an object.";

                continue;
            }
            foreach (['id', 'from', 'to'] as $field) {
                if (! isset($connection[$field]) || ! is_string($connection[$field]) || $connection[$field] === '') {
                    $errors[] = "Connection {$index} requires a non-empty {$field}.";
                }
            }
            if (isset($connection['id']) && is_string($connection['id'])) {
                if (in_array($connection['id'], $connectionIds, true)) {
                    $errors[] = "Duplicate connection ID: {$connection['id']}.";
                }
                $connectionIds[] = $connection['id'];
            }
            if (isset($connection['from']) && ! in_array($connection['from'], $elementIds, true)) {
                $errors[] = "Connection {$index} references unknown source element.";
            }
            if (isset($connection['to']) && ! in_array($connection['to'], $elementIds, true)) {
                $errors[] = "Connection {$index} references unknown target element.";
            }
            if (isset($connection['label']) && ! is_string($connection['label'])) {
                $errors[] = "Connection {$index} label must be a string.";
            }
        }

        return $errors;
    }

    public function validateElement(array $element, string $label = 'Element'): array
    {
        $errors = [];
        foreach (['id', 'type', 'text'] as $field) {
            if (! isset($element[$field]) || ! is_string($element[$field]) || $element[$field] === '') {
                $errors[] = "{$label} requires a non-empty {$field}.";
            }
        }
        if (isset($element['type']) && ! in_array($element['type'], self::SHAPE_TYPES, true)) {
            $errors[] = "{$label} has an unsupported shape type.";
        }
        foreach (['x', 'y', 'width', 'height'] as $field) {
            if (! isset($element[$field]) || ! is_numeric($element[$field])) {
                $errors[] = "{$label} requires numeric {$field}.";
            } elseif (in_array($field, ['width', 'height'], true) && (float) $element[$field] <= 0) {
                $errors[] = "{$label} {$field} must be positive.";
            }
        }
        if (isset($element['style'])) {
            if (! is_array($element['style'])) {
                $errors[] = "{$label} style must be an object.";
            } else {
                foreach (['backgroundColor', 'strokeColor'] as $field) {
                    if (isset($element['style'][$field]) && ! is_string($element['style'][$field])) {
                        $errors[] = "{$label} style {$field} must be a string.";
                    }
                }
            }
        }

        return $errors;
    }

    public function validateActions(array $actions, array $diagram): array
    {
        $errors = $this->validateDiagram($diagram);
        $elements = [];
        $connections = [];
        foreach ($diagram['elements'] ?? [] as $element) {
            if (isset($element['id'])) {
                $elements[$element['id']] = $element;
            }
        }
        foreach ($diagram['connections'] ?? [] as $connection) {
            if (isset($connection['id'])) {
                $connections[$connection['id']] = $connection;
            }
        }

        foreach ($actions as $index => $action) {
            if (! is_array($action) || ! isset($action['type'])) {
                $errors[] = "Action {$index} must have a type.";

                continue;
            }
            $type = $action['type'];
            if (! in_array($type, ['create_shape', 'update_shape', 'delete_shape', 'create_connection', 'update_connection', 'delete_connection', 'arrange_layout'], true)) {
                $errors[] = "Action {$index} has an unsupported type.";

                continue;
            }
            if (str_ends_with($type, 'shape')) {
                if ($type === 'create_shape') {
                    $element = $action['element'] ?? null;
                    if (! is_array($element)) {
                        $errors[] = "Action {$index} requires an element.";
                    } else {
                        $errors = [...$errors, ...$this->validateElement($element, "Action {$index} element")];
                        $id = $element['id'] ?? null;
                        if (is_string($id) && isset($elements[$id])) {
                            $errors[] = "Action {$index} creates a duplicate element ID.";
                        } elseif (is_string($id)) {
                            $elements[$id] = $element;
                        }
                    }
                } elseif ($type === 'update_shape' || $type === 'delete_shape') {
                    $id = $action['id'] ?? null;
                    if (! is_string($id) || ! isset($elements[$id])) {
                        $errors[] = "Action {$index} references an unknown element ID.";
                    }
                    if ($type === 'update_shape' && (! isset($action['changes']) || ! is_array($action['changes']))) {
                        $errors[] = "Action {$index} requires changes.";
                    }
                    if ($type === 'update_shape' && isset($elements[$id], $action['changes']) && is_array($action['changes'])) {
                        $changes = $action['changes'];
                        $allowed = ['type', 'text', 'x', 'y', 'width', 'height', 'style'];
                        foreach (array_keys($changes) as $field) {
                            if (! in_array($field, $allowed, true)) {
                                $errors[] = "Action {$index} contains an unsupported element change.";
                            }
                        }
                        $updated = array_replace($elements[$id], $changes);
                        $errors = [...$errors, ...$this->validateElement($updated, "Action {$index} element")];
                        $elements[$id] = $updated;
                    }
                    if ($type === 'delete_shape' && is_string($id)) {
                        unset($elements[$id]);
                    }
                }
            } elseif (str_ends_with($type, 'connection')) {
                if ($type === 'create_connection') {
                    $connection = $action['connection'] ?? null;
                    if (! is_array($connection)) {
                        $errors[] = "Action {$index} requires a connection.";
                    } else {
                        foreach (['id', 'from', 'to'] as $field) {
                            if (! isset($connection[$field]) || ! is_string($connection[$field])) {
                                $errors[] = "Action {$index} connection requires {$field}.";
                            }
                        }
                        if (isset($connection['from']) && ! isset($elements[$connection['from']])) {
                            $errors[] = "Action {$index} references an unknown source element.";
                        }
                        if (isset($connection['to']) && ! isset($elements[$connection['to']])) {
                            $errors[] = "Action {$index} references an unknown target element.";
                        }
                        $id = $connection['id'] ?? null;
                        if (is_string($id) && isset($connections[$id])) {
                            $errors[] = "Action {$index} creates a duplicate connection ID.";
                        } elseif (is_string($id)) {
                            $connections[$id] = $connection;
                        }
                    }
                } elseif ($type === 'update_connection' || $type === 'delete_connection') {
                    $id = $action['id'] ?? null;
                    if (! is_string($id) || ! isset($connections[$id])) {
                        $errors[] = "Action {$index} references an unknown connection ID.";
                    }
                    if ($type === 'update_connection' && (! isset($action['changes']) || ! is_array($action['changes']))) {
                        $errors[] = "Action {$index} requires changes.";
                    }
                    if ($type === 'update_connection' && isset($connections[$id], $action['changes']) && is_array($action['changes'])) {
                        $changes = $action['changes'];
                        foreach (array_keys($changes) as $field) {
                            if (! in_array($field, ['from', 'to', 'label'], true)) {
                                $errors[] = "Action {$index} contains an unsupported connection change.";
                            }
                        }
                        $updated = array_replace($connections[$id], $changes);
                        if (! isset($elements[$updated['from'] ?? ''])) {
                            $errors[] = "Action {$index} references an unknown source element.";
                        }
                        if (! isset($elements[$updated['to'] ?? ''])) {
                            $errors[] = "Action {$index} references an unknown target element.";
                        }
                        if (isset($updated['label']) && ! is_string($updated['label'])) {
                            $errors[] = "Action {$index} connection label must be a string.";
                        }
                        $connections[$id] = $updated;
                    }
                    if ($type === 'delete_connection' && is_string($id)) {
                        unset($connections[$id]);
                    }
                }
            } elseif ($type === 'arrange_layout') {
                if (! isset($action['positions']) || ! is_array($action['positions'])) {
                    $errors[] = "Action {$index} requires positions.";
                } else {
                    foreach ($action['positions'] as $position) {
                        if (! is_array($position) || ! isset($position['id'], $position['x'], $position['y']) || ! isset($elements[$position['id']]) || ! is_numeric($position['x']) || ! is_numeric($position['y'])) {
                            $errors[] = "Action {$index} contains an invalid position.";
                        }
                    }
                }
            }
        }

        if ($errors !== []) {
            throw new InvalidAiResponseException(implode(' ', $errors));
        }

        return $actions;
    }
}
