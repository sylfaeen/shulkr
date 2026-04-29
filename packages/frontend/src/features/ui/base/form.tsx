import * as React from 'react';
import { Field } from '@base-ui/react/field';
import { useRender } from '@base-ui/react/use-render';
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';

import { cn } from '@shulkr/frontend/lib/cn';

const Form = FormProvider;

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName;
};

const FormFieldContext = React.createContext<FormFieldContextValue>({} as FormFieldContextValue);

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext>
  );
};

type FormItemContextValue = {
  id: string;
};

const FormItemContext = React.createContext<FormItemContextValue>({} as FormItemContextValue);

const useFormField = () => {
  const fieldContext = React.use(FormFieldContext);
  const itemContext = React.use(FormItemContext);
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: fieldContext.name });
  const fieldState = getFieldState(fieldContext.name, formState);
  if (!fieldContext) {
    throw new Error('useFormField should be used within <FormField>');
  }
  const { id } = itemContext;
  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
};

function FormItem({ className, ...props }: Field.Root.Props) {
  const id = React.useId();
  const fieldContext = React.use(FormFieldContext);
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: fieldContext.name });
  const { error } = getFieldState(fieldContext.name, formState);
  return (
    <FormItemContext value={{ id }}>
      <Field.Root data-slot={'form-item'} invalid={!!error} className={cn('grid gap-1', className)} {...props} />
    </FormItemContext>
  );
}

function FormLabel({ className, light, ...props }: Field.Label.Props & { light?: boolean }) {
  const { formItemId } = useFormField();
  return (
    <Field.Label
      data-slot={'form-label'}
      htmlFor={formItemId}
      className={cn(
        'data-[invalid]:text-destructive block gap-2 text-sm select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        light ? 'text-zinc-700 dark:text-zinc-300' : 'text-zinc-600 dark:text-zinc-400',
        className
      )}
      {...props}
    />
  );
}

function FormControl({ children }: { children: React.ReactElement }) {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField();
  return useRender({
    render: children,
    props: {
      'data-slot': 'form-control',
      id: formItemId,
      'aria-describedby': !error ? `${formDescriptionId}` : `${formDescriptionId} ${formMessageId}`,
      'aria-invalid': !!error,
    },
  });
}

function FormDescription({ className, ...props }: Field.Description.Props) {
  const { formDescriptionId } = useFormField();
  return (
    <Field.Description
      data-slot={'form-description'}
      id={formDescriptionId}
      className={cn('text-sm text-zinc-600 dark:text-zinc-400', className)}
      {...props}
    />
  );
}

function FormMessage({ className, children, ...props }: Field.Error.Props) {
  const { error, formMessageId } = useFormField();
  const body = error ? String(error?.message ?? '') : children;
  if (!body) {
    return null;
  }
  return (
    <Field.Error
      data-slot={'form-message'}
      id={formMessageId}
      match={true}
      className={cn('text-destructive text-sm', className)}
      {...props}
    >
      {body}
    </Field.Error>
  );
}

export { useFormField, Form, FormItem, FormLabel, FormControl, FormDescription, FormMessage, FormField };
