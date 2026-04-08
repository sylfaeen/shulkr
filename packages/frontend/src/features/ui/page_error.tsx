type PageErrorProps = {
  message: string;
};

export function PageError({ message }: PageErrorProps) {
  return (
    <div className={'flex items-center justify-center py-20'}>
      <div className={'text-red-600'}>{message}</div>
    </div>
  );
}
