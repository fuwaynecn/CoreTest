import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <main className="loginPage">
      <div className="loginPanel">
        <p className="eyebrow">家庭数学训练</p>
        <h1>选择身份登录</h1>
        <p>孩子使用登录名和 PIN，家长使用登录名和家长密码。</p>
        <LoginForm />
      </div>
    </main>
  );
}
